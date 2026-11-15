// create-admin.js
// Uso: node create-admin.js <email> <password>
// Crea un usuario en Firebase Auth y asigna el rol "admin" en la colección usuarios.
// Requiere el archivo serviceAccountKey.json en la raíz del proyecto con permisos de administrador.

const admin = require('firebase-admin');
const path = require('path');

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

const email = process.argv[2];
const password = process.argv[3];
if (!email || !password) {
  console.error('Uso: node create-admin.js <email> <password>');
  process.exit(1);
}

(async () => {
  try {
    // Crear usuario en Auth
    const userRecord = await admin.auth().createUser({
      email,
      password,
      emailVerified: false,
    });
    console.log(`✅ Usuario creado: UID = ${userRecord.uid}`);

    // Asignar rol admin en la colección usuarios
    const db = admin.firestore();
    await db.collection('usuarios').doc(userRecord.uid).set({ rol: 'admin' }, { merge: true });
    console.log('✅ Rol "admin" asignado en la colección usuarios.');
    process.exit(0);
  } catch (err) {
    console.error('❌ Error al crear el usuario o asignar el rol:', err);
    process.exit(1);
  }
})();
