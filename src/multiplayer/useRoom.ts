import { useCallback, useEffect, useRef, useState } from 'react';
import type { RealtimeChannel } from '@supabase/supabase-js';
import { supabase } from '@/utils/supabase';

// Code-based 1v1 rooms over Supabase Realtime.
//
// Row (public.rooms) = membership + layout seed. Everything in-match goes over
// the `room:<code>` channel:
//   presence  → who's connected (both sides see "opponent joined/left")
//   'shot'    → { angle, power }  the shooter's own aim, in ITS frame
//   'result'  → { zone, hp }      authoritative outcome from the shooter's sim
//   'skin'    → { skinId }        cosmetic so the opponent renders your skin
//   'ready'   → {}                both ready → host fires first
//
// Both clients run the same deterministic sim; the shooter is authoritative on
// the outcome so tiny float differences can't desync HP. The receiving side
// mirrors the shot (angle → π - angle) because each client draws itself on the
// left. See GameCanvas for the geometry.

export type Role = 'host' | 'guest';
export type Room = { code: string; host_id: string; guest_id: string | null; seed: number; status: string };

export type RemoteShot = { angle: number; power: number };
export type RemoteResult = { zone: 'head' | 'body' | 'miss'; hp: number };

type Handlers = {
  onShot?: (s: RemoteShot) => void;
  onResult?: (r: RemoteResult) => void;
  onSkin?: (skinId: string) => void;
  onOpponentPresence?: (present: boolean) => void;
  onOpponentLeft?: () => void;
};

const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no 0/O/1/I
export const makeRoomCode = () =>
  Array.from({ length: 6 }, () => ALPHABET[Math.floor(Math.random() * ALPHABET.length)]).join('');

export async function createRoom(): Promise<Room> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Sign in with your wallet first');
  // Retry on code collision (1 in 1e9, but cheap to handle).
  for (let i = 0; i < 3; i++) {
    const code = makeRoomCode();
    const seed = Math.floor(Math.random() * 2_147_483_647);
    const { data, error } = await supabase
      .from('rooms')
      .insert({ code, host_id: user.id, seed })
      .select()
      .single();
    if (!error && data) return data as Room;
    if (error && error.code !== '23505') throw error;
  }
  throw new Error('Could not create a room, try again');
}

// Host backed out before anyone joined: close the seat so the shared code
// stops working (join_room only fills rooms still in 'waiting').
export async function cancelRoom(code: string): Promise<void> {
  await supabase
    .from('rooms')
    .update({ status: 'finished', updated_at: new Date().toISOString() })
    .eq('code', code)
    .eq('status', 'waiting');
}

export async function joinRoom(code: string): Promise<Room> {
  const { data, error } = await supabase.rpc('join_room', { p_code: code.trim().toUpperCase() });
  if (error) throw new Error(error.message.includes('not available') ? 'Room not found or already full' : error.message);
  return data as Room;
}

export function useRoomChannel(code: string | undefined, role: Role | undefined, handlers: Handlers) {
  const [connected, setConnected] = useState(false);
  const [opponentPresent, setOpponentPresent] = useState(false);
  const channelRef = useRef<RealtimeChannel | null>(null);
  const handlersRef = useRef(handlers);
  useEffect(() => {
    handlersRef.current = handlers;
  });

  useEffect(() => {
    if (!code || !role) return;
    const channel = supabase.channel(`room:${code}`, {
      config: { presence: { key: role }, broadcast: { self: false, ack: false } },
    });
    channelRef.current = channel;

    const other = role === 'host' ? 'guest' : 'host';
    const syncPresence = () => {
      const state = channel.presenceState();
      const present = Object.keys(state).includes(other);
      setOpponentPresent(present);
      handlersRef.current.onOpponentPresence?.(present);
    };

    channel
      .on('presence', { event: 'sync' }, syncPresence)
      .on('presence', { event: 'leave' }, ({ key }) => {
        if (key === other) handlersRef.current.onOpponentLeft?.();
      })
      .on('broadcast', { event: 'shot' }, ({ payload }) => handlersRef.current.onShot?.(payload as RemoteShot))
      .on('broadcast', { event: 'result' }, ({ payload }) => handlersRef.current.onResult?.(payload as RemoteResult))
      .on('broadcast', { event: 'skin' }, ({ payload }) => handlersRef.current.onSkin?.((payload as { skinId: string }).skinId))
      .subscribe(async (status) => {
        if (status === 'SUBSCRIBED') {
          setConnected(true);
          await channel.track({ role, at: Date.now() });
        } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
          setConnected(false);
        }
      });

    return () => {
      channel.untrack().catch(() => {});
      supabase.removeChannel(channel).catch(() => {});
      channelRef.current = null;
      setConnected(false);
      setOpponentPresent(false);
    };
  }, [code, role]);

  const send = useCallback((event: 'shot' | 'result' | 'skin' | 'ready', payload: object) => {
    channelRef.current?.send({ type: 'broadcast', event, payload }).catch(() => {});
  }, []);

  const finish = useCallback(
    async (winnerId: string | null) => {
      if (!code) return;
      await supabase.from('rooms').update({ status: 'finished', winner_id: winnerId, updated_at: new Date().toISOString() }).eq('code', code);
    },
    [code],
  );

  return { connected, opponentPresent, send, finish };
}

// Host-side: wait for a guest to take the seat (rooms row update via realtime).
export function useWaitForGuest(code: string | undefined, enabled: boolean, onJoined: (room: Room) => void) {
  // Latest callback without re-subscribing the channel on every render.
  const onJoinedRef = useRef(onJoined);
  useEffect(() => {
    onJoinedRef.current = onJoined;
  });
  useEffect(() => {
    if (!code || !enabled) return;
    let fired = false; // realtime UPDATE and the initial poll can both land
    const onJoined = (room: Room) => {
      if (fired) return;
      fired = true;
      onJoinedRef.current(room);
    };
    const channel = supabase
      .channel(`room-row:${code}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'rooms', filter: `code=eq.${code}` },
        (payload) => {
          const row = payload.new as Room;
          if (row.guest_id) onJoined(row);
        },
      )
      .subscribe();
    // Also poll once in case the update landed before we subscribed.
    supabase
      .from('rooms')
      .select()
      .eq('code', code)
      .single()
      .then(({ data }) => {
        if (data?.guest_id) onJoined(data as Room);
      });
    return () => {
      supabase.removeChannel(channel).catch(() => {});
    };
  }, [code, enabled]);
}
