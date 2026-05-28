import dotenv from 'dotenv';
import path from 'path';
import mongoose from 'mongoose';

dotenv.config({ path: path.resolve('p:/study-buddy/server/.env') });

async function getStats() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    const db = mongoose.connection.db;
    const docs = await db.collection('documents').countDocuments();
    const chunks = await db.collection('chunks').countDocuments();
    console.log(`Docs: ${docs}, Chunks: ${chunks}`);
    process.exit(0);
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
}
getStats();
