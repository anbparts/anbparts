import { hashPassword } from '../src/lib/auth';

const password = String(process.argv[2] || '').trim();

if (!password) {
  console.error('Uso: npm run auth:hash -- "sua-senha"');
  process.exit(1);
}

console.log(hashPassword(password));
