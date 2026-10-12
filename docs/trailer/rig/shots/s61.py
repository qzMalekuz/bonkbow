"""TITLE. BONK BOW. Four extra days. Zero extra skill. The arrow sting."""
from shots import s48

START, END = 25.7, 29.0
CUES = [(0.0, 'logo_hit'), (0.85, 'whoosh'), (1.0, 'thock'), (1.0, 'silence'), (1.85, 'bonk')]
LINE = "4 EXTRA DAYS.  0 EXTRA SKILL."


def build():
    s48.LINE = LINE
    s48.build()
