// Genererer en bcrypt-hash til FLEET_ADMIN_PASSWORD_HASH i .env.
// Bruk: node src/scripts/hashPassword.mjs <passord>
import bcrypt from 'bcrypt';

const password = process.argv[2];
if (!password) {
  console.error('Bruk: node src/scripts/hashPassword.mjs <passord>');
  process.exit(1);
}
console.log(bcrypt.hashSync(password, 10));
