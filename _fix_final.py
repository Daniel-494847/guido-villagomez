import re
from pathlib import Path

p = Path('d:/PROYECTOS/Guido_Villagomez_2026/app.js')
text = p.read_text(encoding='utf-8')

# Correcciones aplicadas en un solo paso.
fixes = [
    ('Â¿CuÃ¡l es la sede de gobierno de Bolivia?', '¿Cuál es la sede de gobierno de Bolivia?'),
    ('Â¿En quÃ© aÃ±o se promulgÃ³ la actual ConstituciÃ³n PolÃ­tica del Estado?', '¿En qué año se promulgó la actual Constitución Política del Estado?'),
    ('Â¿QuÃ© ocÃ©ano baÃ±a la costa oeste de SudamÃ©rica?', '¿Qué océano baña la costa oeste de Sudamérica?'),
    ('Â¿CuÃ¡ntos departamentos tiene Bolivia?', '¿Cuántos departamentos tiene Bolivia?'),
    ('Â¿Concluir la evaluaciÃ³n de', '¿Concluir la evaluación de'),
    ('Â¿Reabrir la evaluaciÃ³n de', '¿Reabrir la evaluación de'),
    ('Se concluirÃ³ la evaluaciÃ³n de', 'Se concluyó la evaluación de'),
    ('Se eliminarÃ¡n permanentemente', 'Se eliminarán permanentemente'),
    ('se conservarÃ¡n', 'se conservarán'),
    ('Â¿Continuar?', '¿Continuar?'),
    ('Se REEMPLAZARÃ por completo', 'Se REEMPLAZARÁ por completo'),
    ('Ã¡rea', 'Área'),
    ('MatemÃ¡tica', 'Matemática'),
    ('ComunicaciÃ³n y Lenguajes', 'Comunicación y Lenguajes'),
    ('TÃ©cnica TecnolÃ³gica', 'Técnica Tecnológica'),
    ('EducaciÃ³n FÃ­sica y Deportes', 'Educación Física y Deportes'),
    ('Artes PlÃ¡sticas y Visuales', 'Artes Plásticas y Visuales'),
    ('Valores, Espiritualidad y Religiones', 'Valores, Espiritualidad y Religiones'),
    ('aÃºn no hay evaluaciones registradas', 'aún no hay evaluaciones registradas'),
    ('aÃºn no hay preguntas para este curso', 'aún no hay preguntas para este curso'),
    ('No se encontrÃ³ la configuraciÃ³n del curso', 'No se encontró la configuración del curso'),
    ('No se encontrÃ³ el resultado del estudiante', 'No se encontró el resultado del estudiante'),
    ('No se pudo conectar con Firestore', 'No se pudo conectar con Firestore'),
    ('No se pudo iniciar sesiÃ³n', 'No se pudo iniciar sesión'),
    ('No se pudo validar la sesiÃ³n', 'No se pudo validar la sesión'),
    ('No se cargÃ³ la librerÃ­a PDF', 'No se cargó la librería PDF'),
    ('No se encontraron las preguntas de esta evaluaciÃ³n', 'No se encontraron las preguntas de esta evaluación'),
    ('TÃ­tulo de la evaluaciÃ³n', 'Título de la evaluación'),
    ('Registro del estudiante clasificado por curso y Ã¡rea', 'Registro del estudiante clasificado por curso y Área'),
    ('Si ya habÃ­a empezado', 'Si ya había empezado'),
    ('Al menos una respuesta debe estar marcada', 'Al menos una respuesta debe estar marcada'),
    ('No se pudo guardar en Firebase', 'No se pudo guardar en Firebase'),
    ('No hay evaluaciÃ³n configurada para este curso', 'No hay evaluación configurada para este curso'),
    ('Este resultado no conserva una copia del examen', 'Este resultado no conserva una copia del examen'),
    ('Actualiza el reporte e intÃ©ntalo de nuevo', 'Actualiza el reporte e inténtalo de nuevo'),
    ('AÃºn no hay evaluaciones registradas para este curso', 'Aún no hay evaluaciones registradas para este curso'),
    ('Gana el origen con mÃ¡s respuestas respondidas', 'Gana el origen con más respuestas respondidas'),
    ('Esta acciÃ³n estÃ¡ reservada al administrador', 'Esta acción está reservada al administrador'),
    ('No se encontrÃ³ la configuraciÃ³n del curso. Actualiza el reporte e intÃ©ntalo de nuevo.', 'No se encontró la configuración del curso. Actualiza el reporte e inténtalo de nuevo.'),
    ('La prueba aplica a todos los paralelos (A, B y C)', 'La prueba aplica a todos los paralelos (A, B y C)'),
    ('Cada curso tiene su propio archivo JSON. Al cargarlo, se selecciona automÃ¡ticamente el curso indicado. Los archivos plantilla de cursos sin preguntas se pueden completar antes de cargarlos. También puedes pegar el examen (preguntas \"1.- ...\" y opciones \"a) ...\") y la clave de respuestas, por ejemplo: 1c 2b 3b 4c. La prueba aplica a todos los paralelos (A, B y C) del curso.', 'Cada curso tiene su propio archivo JSON. Al cargarlo, se selecciona automáticamente el curso indicado. Los archivos plantilla de cursos sin preguntas se pueden completar antes de cargarlos. También puedes pegar el examen (preguntas \"1.- ...\" y opciones \"a) ...\") y la clave de respuestas, por ejemplo: 1c 2b 3b 4c. La prueba aplica a todos los paralelos (A, B y C) del curso.'),
    ('La confirmaciÃ³n estÃ¡ bloqueada', 'La confirmación está bloqueada'),
    ('EvaluaciÃ³n ya registrada.', 'Evaluación ya registrada.'),
    ('Guardandoâ€¦', 'Guardando…'),
    ('Estudiante registrado', 'Estudiante registrado'),
    ('¡Enviada!', '¡Enviada!'),
    ('Respuesta enviada correctamente.', 'Respuesta enviada correctamente.'),
    ('No tienes una evaluación activa', 'No tienes una evaluación activa'),
    ('Ya no puedes responder.', 'Ya no puedes responder.'),
    ('Las preguntas con clave están en "examenes"', 'Las preguntas con clave están en "examenes"'),
    ('Con un intento sin calificar', 'Con un intento sin calificar'),
    ('Reabrir la evaluaciÃ³n', 'Reabrir la evaluación'),
    ('Concluir la evaluaciÃ³n', 'Concluir la evaluación'),
    ('Se CONCLUYO', 'Se CONCLUYO'),
    ('Se REEMPLAZARÃ', 'Se REEMPLAZARÁ'),
    ('Ã¢Ã¢Ã¢Ã¢', '——'),
    ('\\u2014', '—'),
    ('\\u2013', '–'),
    ('\\u2019', '’'),
    ('\\u201c', '"'),
    ('\\u201d', '"'),
]

for old, new in fixes:
    if old in text:
        text = text.replace(old, new)

p.write_text(text, encoding='utf-8')
print('reemplazos aplicados:', len(fixes))
