import re
from pathlib import Path

p = Path('d:/PROYECTOS/Guido_Villagomez_2026/app.js')
text = p.read_text(encoding='utf-8')

patterns = ['Â¿', 'Ã¡', 'Ã©', 'Ã­', 'Ã³', 'Ãº', 'Ã±', 'â€', 'ðŸ', 'â–±', 'â–¯', 'Â·', 'Â']

for pat in patterns:
    print(pat, text.count(pat))
