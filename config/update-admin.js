const mongoose = require('mongoose');
const connect = require('./connect');

(async () => {
  await connect();

  // Check if elijah@paralegal.lk exists
  const elijah = await mongoose.connection.db.collection('users').findOne({ email: 'elijah@paralegal.lk' });
  if (!elijah) {
    console.red('User elijah@paralegal.lk does not exist');
    process.exit(1);
  }

  // Make elijah@paralegal.lk ADMIN
  await mongoose.connection.db.collection('users').updateOne(
    { email: 'elijah@paralegal.lk' },
    { $set: { role: 'ADMIN' } }
  );
  console.green('Updated elijah@paralegal.lk to ADMIN');

  // Make tharushi.edinushika@gmail.com a normal user
  await mongoose.connection.db.collection('users').updateOne(
    { email: 'tharushi.edinushika@gmail.com' },
    { $set: { role: 'USER' } }
  );
  console.green('Updated tharushi.edinushika@gmail.com to USER');

  // Verify changes
  const admins = await mongoose.connection.db.collection('users').find({ role: 'ADMIN' }).project({ email: 1, name: 1, role: 1 }).toArray();
  console.purple('\nCurrent admin users:');
  admins.forEach(u => console.log('  -', u.email, '|', u.name));

  process.exit(0);
})();
