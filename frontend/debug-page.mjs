import puppeteer from 'puppeteer';

(async () => {
  const browser = await puppeteer.launch();
  const page = await browser.newPage();
  
  page.on('console', msg => {
    if (msg.type() === 'error') {
      console.log('PAGE ERROR:', msg.text());
    }
  });

  page.on('pageerror', error => {
    console.log('PAGE EXCEPTION:', error.message);
  });

  try {
    console.log('Navigating to http://localhost:5173/infrastructure-reports ...');
    await page.goto('http://localhost:5173/infrastructure-reports', { waitUntil: 'networkidle0' });
    
    // Check if ErrorBoundary text is present
    const content = await page.content();
    if (content.includes('Something went wrong')) {
      console.log('ErrorBoundary was triggered!');
      
      const errorText = await page.evaluate(() => {
        const errDiv = document.querySelector('.bg-red-100');
        return errDiv ? errDiv.textContent : 'No error details found on page';
      });
      console.log('Error details from page:', errorText);
    } else {
      console.log('Page loaded successfully without ErrorBoundary.');
    }
  } catch (err) {
    console.error('Script error:', err);
  } finally {
    await browser.close();
  }
})();
