import { QRCodeSVG, QRCodeCanvas } from 'qrcode.react';
import { FaDownload, FaCopy, FaQrcode } from 'react-icons/fa';
import { toast } from 'react-toastify';

/**
 * DonationQRPanel
 * ───────────────
 * Displays the unique QR code for a selected payment method and lets the donor
 * download it as a high-resolution (1024×1024) PNG for scanning from their
 * mobile banking app.
 */
export default function DonationQRPanel({ payload, method, amountLabel, reference }) {
  const value = typeof payload === 'string' ? payload : JSON.stringify(payload);

  const handleDownload = () => {
    const canvas = document.getElementById('donation-qr-download-canvas');
    if (!canvas) {
      toast.error('Could not generate the QR image.');
      return;
    }
    try {
      const dataUrl = canvas.toDataURL('image/png');
      const link = document.createElement('a');
      link.href = dataUrl;
      link.download = `EthioBridge-QR-${method?.code || 'donation'}-${reference || Date.now()}.png`;
      link.click();
      toast.success('QR code downloaded');
    } catch (err) {
      toast.error('Download failed. Try again.');
    }
  };

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      toast.success('Payment details copied');
    } catch {
      toast.error('Could not copy to clipboard');
    }
  };

  return (
    <div className="flex flex-col items-center text-center">
      <div className="inline-flex p-4 bg-white rounded-2xl shadow-lg border-2 border-dashed border-gray-200 dark:border-gray-600">
        <QRCodeSVG value={value} size={220} level="H" includeMargin fgColor="#111827" bgColor="#ffffff" />
      </div>

      {/* High-resolution canvas used only for PNG download */}
      <div className="absolute opacity-0 pointer-events-none -z-10" aria-hidden="true">
        <QRCodeCanvas id="donation-qr-download-canvas" value={value} size={1024} level="H" includeMargin fgColor="#111827" bgColor="#ffffff" />
      </div>

      <p className="mt-4 text-base font-semibold text-gray-800 dark:text-gray-200 flex items-center gap-2">
        <FaQrcode className="text-primary-500" /> Scan to Pay
      </p>
      <p className="text-sm text-gray-500 dark:text-gray-400 max-w-xs">
        Scan this QR with your <strong>{method?.name || 'banking app'}</strong> mobile app to pay{' '}
        <strong className="text-gray-800 dark:text-gray-200">{amountLabel}</strong>.
      </p>

      {reference && (
        <p className="mt-2 text-xs font-mono bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400 px-3 py-1 rounded-lg">
          Ref: {reference}
        </p>
      )}

      <div className="flex flex-wrap gap-3 justify-center mt-4">
        <button
          onClick={handleDownload}
          className="btn-primary py-2 px-5 flex items-center gap-2 shadow-md"
        >
          <FaDownload /> Download QR Code
        </button>
        <button onClick={handleCopy} className="btn-secondary py-2 px-5 flex items-center gap-2">
          <FaCopy /> Copy Details
        </button>
      </div>
    </div>
  );
}
