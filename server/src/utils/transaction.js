import mongoose from 'mongoose';

/**
 * Runs a callback inside a MongoDB transaction if replica set transactions are supported.
 * If running on a standalone local MongoDB without a replica set, gracefully executes
 * the callback without a session so local development works without configuration hurdles.
 *
 * @param {Function} workFn - async function(session) to execute
 * @returns {Promise<any>} result of workFn
 */
export async function runInTransaction(workFn) {
  let session = null;

  try {
    session = await mongoose.startSession();
    session.startTransaction();

    const result = await workFn(session);

    await session.commitTransaction();
    return result;
  } catch (error) {
    if (session) {
      try {
        await session.abortTransaction();
      } catch (abortErr) {
        // If abort fails because standalone doesn't support transactions
        if (isStandaloneTransactionError(error) || isStandaloneTransactionError(abortErr)) {
          // Retry without session for standalone MongoDB
          return await workFn(null);
        }
      }
    }

    // Check if error is because MongoDB is running in standalone mode (no replica set)
    if (isStandaloneTransactionError(error)) {
      console.warn(
        '⚠️ MongoDB is running in standalone mode (no replica set). Executing operation without ACID session for local development.'
      );
      return await workFn(null);
    }

    throw error;
  } finally {
    if (session) {
      session.endSession();
    }
  }
}

function isStandaloneTransactionError(err) {
  if (!err) return false;
  const msg = err.message || '';
  return (
    msg.includes('replica set') ||
    msg.includes('Transaction numbers are only allowed on a replica set member') ||
    msg.includes('Cannot call `create()` with a session')
  );
}
