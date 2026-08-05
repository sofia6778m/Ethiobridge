/**
 * seedPaymentMethods.js
 * ─────────────────────
 * Seeds the built-in Ethiopian donation payment methods (Telebirr, CBE Birr,
 * CBE Bank, Awash, Dashen, Amole) on startup if they do not already exist.
 *
 * Account numbers / holder names below are PLACEHOLDERS that the municipal
 * finance office must replace from the admin Payment Methods screen before
 * going live. The seed is upsert-on-code and idempotent — it will never
 * overwrite admin-edited values.
 */
const DonationPaymentMethod = require('../models/DonationPaymentMethod');

const DEFAULT_METHODS = [
  {
    code: 'telebirr',
    name: 'Telebirr',
    nameAmharic: 'ቴሌብር',
    type: 'mobile_wallet',
    accountNumber: '09-0000-0000',
    accountHolder: 'EthioBridge Municipal Fund',
    branch: '',
    additionalInfo: 'Pay to the Telebirr merchant number above using your Telebirr app.',
    instructions:
      '1. Open your Telebirr app → Send Money.\n2. Enter the merchant number and amount.\n3. Confirm with your PIN.\n4. Upload your payment confirmation screenshot below.',
    iconKey: 'FaMobileAlt',
    colorHex: '#FBBF24',
    isActive: true,
    isDefault: true,
    sortOrder: 10,
  },
  {
    code: 'cbe_birr',
    name: 'CBE Birr',
    nameAmharic: 'ሲቢኢ ብር',
    type: 'mobile_wallet',
    accountNumber: '1000-0000-0000-0000',
    accountHolder: 'EthioBridge Municipal Fund',
    branch: '',
    additionalInfo: 'Transfer from your CBE Birr app wallet to the number above.',
    instructions:
      '1. Open CBE Birr → Transfer → To Wallet.\n2. Enter the wallet number and amount.\n3. Confirm with your PIN.\n4. Upload your payment confirmation screenshot below.',
    iconKey: 'FaUniversity',
    colorHex: '#2563EB',
    isActive: true,
    isDefault: false,
    sortOrder: 20,
  },
  {
    code: 'cbe_bank',
    name: 'CBE Bank Transfer',
    nameAmharic: 'ሲቢኢ ባንክ ዝውውር',
    type: 'bank',
    accountNumber: '1000-0000-0000-0000',
    accountHolder: 'EthioBridge Municipal Fund',
    branch: 'Head Office — Addis Ababa',
    additionalInfo: 'Bank-to-bank transfer via CBE Birr / internet banking / branch.',
    instructions:
      '1. Log in to your banking app (or visit a branch).\n2. Add the account above as beneficiary.\n3. Transfer your donation amount.\n4. Upload the transfer receipt (screenshot or photo) below.',
    iconKey: 'FaLandmark',
    colorHex: '#1D4ED8',
    isActive: true,
    isDefault: false,
    sortOrder: 30,
  },
  {
    code: 'awash_bank',
    name: 'Awash Bank Transfer',
    nameAmharic: 'አዋሽ ባንክ ዝውውር',
    type: 'bank',
    accountNumber: '0130-0000-0000-00',
    accountHolder: 'EthioBridge Municipal Fund',
    branch: 'Main Branch — Addis Ababa',
    additionalInfo: 'Bank transfer via Awash Mobile Banking or any Awash branch.',
    instructions:
      '1. Open Awash Mobile Banking (or visit a branch).\n2. Pay to the account above.\n3. Upload the transfer receipt below.',
    iconKey: 'FaLandmark',
    colorHex: '#B91C1C',
    isActive: true,
    isDefault: false,
    sortOrder: 40,
  },
  {
    code: 'dashen_bank',
    name: 'Dashen Bank Transfer',
    nameAmharic: 'ዳሸን ባንክ ዝውውር',
    type: 'bank',
    accountNumber: '0400-0000-0000-00',
    accountHolder: 'EthioBridge Municipal Fund',
    branch: 'Head Office — Addis Ababa',
    additionalInfo: 'Bank transfer via Dashen Mobile Banking or any Dashen branch.',
    instructions:
      '1. Open Dashen Mobile Banking (or visit a branch).\n2. Pay to the account above.\n3. Upload the transfer receipt below.',
    iconKey: 'FaLandmark',
    colorHex: '#A16207',
    isActive: true,
    isDefault: false,
    sortOrder: 50,
  },
  {
    code: 'amole',
    name: 'Amole',
    nameAmharic: 'አሞሌ',
    type: 'mobile_wallet',
    accountNumber: '09-1111-2222',
    accountHolder: 'EthioBridge Municipal Fund',
    branch: '',
    additionalInfo: 'Amole mobile money wallet (Commercial Bank of Ethiopia).',
    instructions:
      '1. Open your Amole app → Send Money.\n2. Enter the wallet number and amount.\n3. Confirm with your PIN.\n4. Upload your payment confirmation screenshot below.',
    iconKey: 'FaWallet',
    colorHex: '#0E7490',
    isActive: true,
    isDefault: false,
    sortOrder: 60,
  },
  {
    code: 'chapa_payment',
    name: 'Chapa Online Payment',
    nameAmharic: 'ቻፓ የመስመር ላይ ክፍያ',
    type: 'aggregator',
    accountNumber: '',
    accountHolder: '',
    branch: '',
    additionalInfo: 'Pay online with your card, Telebirr or CBE Birr through the Chapa payment gateway.',
    instructions:
      '1. Choose "Pay online" during checkout.\n2. You will be redirected to the secure Chapa page.\n3. Complete the payment with your preferred option.\n4. Your donation is verified automatically.',
    iconKey: 'FaCreditCard',
    colorHex: '#4F46E5',
    isActive: true,
    isDefault: false,
    sortOrder: 70,
  },
  {
    code: 'coopay_amole',
    name: 'Coopay / Amole Online',
    nameAmharic: 'ኮፓይ / አሞሌ ክፍያ',
    type: 'aggregator',
    accountNumber: '',
    accountHolder: '',
    branch: '',
    additionalInfo: 'Pay with Amole mobile money through the Coopay Commerce gateway.',
    instructions:
      '1. Choose "Pay with Coopay/Amole" during checkout.\n2. You will be redirected to the secure Coopay page.\n3. Complete the payment with your Amole wallet.\n4. Your donation is verified automatically.',
    iconKey: 'FaMobileAlt',
    colorHex: '#DB2777',
    isActive: true,
    isDefault: false,
    sortOrder: 80,
  },
];

const seedPaymentMethods = async () => {
  const existing = await DonationPaymentMethod.find({}).select('code').lean();
  const existingCodes = new Set(existing.map((m) => m.code));

  let created = 0;
  for (const method of DEFAULT_METHODS) {
    if (existingCodes.has(method.code)) continue;
    await DonationPaymentMethod.create(method);
    created += 1;
  }

  if (created) {
    console.log(`[DONATIONS] ✅ Seeded ${created} default payment method(s).`);
  }
  return created;
};

module.exports = { seedPaymentMethods, DEFAULT_METHODS };
