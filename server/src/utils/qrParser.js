import { AppError } from '../middleware/errorHandler.js';

/**
 * Parses simulated shop QR codes (UPI or KidLedger QR payloads)
 * Example inputs:
 * 1. "kidledger://pay?merchantId=673m&amount=15000"
 * 2. "upi://pay?pa=subway@bank&pn=Subway&merchantId=673m&am=150.00"
 * 3. JSON string: '{"merchantId": "673m", "amount": 15000}'
 */
export function parseQRCode(payload) {
  if (!payload || typeof payload !== 'string') {
    throw new AppError('Invalid QR code payload: Expected non-empty string', 400, 'INVALID_QR_CODE');
  }

  // 1. Try JSON format
  if (payload.trim().startsWith('{')) {
    try {
      const data = JSON.parse(payload);
      if (!data.merchantId) throw new Error('Missing merchantId');
      return {
        merchantId: data.merchantId,
        amount: data.amount ? Math.round(Number(data.amount)) : undefined,
        note: data.note || 'QR Code Scan Payment',
      };
    } catch {
      throw new AppError('Malformed JSON QR code payload', 400, 'INVALID_QR_CODE');
    }
  }

  // 2. Try URL / URI format (kidledger://pay?... or upi://pay?...)
  try {
    const url = new URL(payload.replace(/^(kidledger|upi):\/\//, 'http://dummy/'));
    const params = url.searchParams;

    const merchantId = params.get('merchantId');
    if (!merchantId) {
      throw new AppError('QR code is missing required merchant identifier', 400, 'INVALID_QR_CODE');
    }

    let amount;
    if (params.get('amount')) {
      amount = parseInt(params.get('amount'), 10);
    } else if (params.get('am')) {
      // UPI 'am' is in INR float (e.g. 150.50) -> convert to integer paise
      amount = Math.round(parseFloat(params.get('am')) * 100);
    }

    return {
      merchantId,
      amount,
      note: params.get('note') || params.get('pn') || 'QR Code Scan Payment',
    };
  } catch (err) {
    if (err instanceof AppError) throw err;
    throw new AppError('Failed to parse QR code format', 400, 'INVALID_QR_CODE');
  }
}
