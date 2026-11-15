# Evaluación en línea

La aplicación es estática y puede publicarse en GitHub Pages. La base de datos y la autenticación funcionan en Firebase; GitHub Pages no aloja la base de datos.

## Configuración de Firebase

La configuración del cliente en `app.js`, `.firebaserc` y `firebase.json` apunta al proyecto `evaluaciones-guido-2026`. Antes de publicar:

1. En Firebase Console, abre ese proyecto y crea una base de datos de **Cloud Firestore**. No uses el modo de prueba.
2. En **Authentication → Sign-in method**, habilita **Anonymous** y **Email/Password**.
3. En **Authentication → Settings → Authorized domains**, agrega el dominio de GitHub Pages, por ejemplo `daniel-494847.github.io` (sin protocolo ni ruta). Agrega también el dominio personalizado si usarás uno.
4. Crea una cuenta administrativa en Authentication con correo y contraseña. Copia su UID y crea manualmente en Firestore `usuarios/{UID}` con el campo `rol` de tipo string y valor `admin`. No guardes contraseñas en el repositorio.
5. Desde el administrador de Firebase CLI, despliega las reglas incluidas en este repositorio:

   ```sh
   firebase login
   firebase deploy --only firestore:rules --project evaluaciones-guido-2026
   ```

6. Inicia sesión en la aplicación con la cuenta administrativa y pulsa **Crear colecciones faltantes**. Esto crea los cursos y preguntas de ejemplo; luego podrás importar los exámenes reales.
7. En GitHub, habilita **Settings → Pages** para publicar la raíz del repositorio (o configura tu flujo de Pages preferido).

## Enlace directo para estudiantes

Después de publicar en GitHub Pages, comparte este enlace para abrir directamente el formulario sin mostrar el botón de administrador:

`https://daniel-494847.github.io/guido-villagomez/?modo=estudiante`

Las reglas permiten a estudiantes anónimos leer preguntas sin clave y enviar sus propias respuestas. Solo el personal autorizado puede leer las claves, las notas y los reportes. Los registros de un intento concluido no se pueden volver a leer por el estudiante.
