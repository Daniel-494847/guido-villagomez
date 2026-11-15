// set-role.js
// Uso: node set-role.js <UID> <admin|docente>
// Necesita la clave de servicio de Firebase con permisos de administrador.

const admin = require('firebase-admin');
const path = require('path');

// Asegúrate de que el archivo serviceAccountKey.json exista en la raíz del proyecto.
const serviceAccountPath = path.resolve(__dirname, 'serviceAccountKey.json');
let serviceAccount;
try {
  serviceAccount = require(serviceAccountPath);
} catch (e) {
  console.error('⚠️ No se encontró serviceAccountKey.json en la raíz del proyecto.');
  console.error('   Copia la clave de servicio de Firebase a este archivo y vuelve a ejecutar el script.');
  process.exit(1);
}

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const uid = process.argv[2];
const role = process.argv[3]; // 'admin' o 'docente'

if (!uid || !role || !['admin', 'docente'].includes(role)) {
  console.error('Uso correcto: node set-role.js <UID> <admin|docente>');
  process.exit(1);
}

admin.firestore()
  .collection('usuarios')
  .doc(uid)
  .set({ rol: role }, { merge: true })
  .then(() => {
    console.log(`✅ Rol "${role}" asignado al usuario ${uid}`);
    process.exit(0);
  })
  .catch(err => {
    console.error('❌ Error al actualizar Firestore:', err);
    process.exit(1);
  });
