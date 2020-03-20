const pupHelper = require('./puppeteerhelper');
const fs = require('fs');
const xlsxj = require("xlsx-to-json-lc");
const axios = require('axios');
const {siteLink, inputFile, captchaKey, captchaUrl, captchaRespUrl, captchaReportGood, captchaReportBad, retryAttempts} = require('./keys.js');
let CINs;
let browser;

process.on('uncaughtException', function (err) {
  console.log(`UnCaught Exception: ${err}`);
});

process.on('unhandledRejection', err => {
  console.log(`Unhandled Rejection: ${err}`);
  
});

const run = () => new Promise(async (resolve, reject) => {
  try {
    
    // Remove Existing Results Found
    if (fs.existsSync('results.csv')) fs.unlinkSync('results.csv');
    if (fs.existsSync('failecompanies.csv')) fs.unlinkSync('failecompanies.csv');
    
    // Import CINs stored in CINs.xlsx
    CINs = await excelToJson();

    // Launch Browser
    browser = await pupHelper.launchBrowser();
    
    // Loop through all CINs
    for (let i = 0; i < CINs.length; i++) {
      for (let j = 0; j < retryAttempts; j++) {
        console.log(`${i+1}/${CINs.length} - Fetching Data for CIN: ${CINs[i].cin} - Attempt ${j+1}`);
        const foundComapny = await fetchData(CINs[i].cin);
        if (foundComapny) break;
        if (j == retryAttempts - 1) {
          writeToCsv('failecompanies.csv', CINs[i].cin);
        }
      }
    }

    await browser.close();
    resolve(true);
  } catch (error) {
    await browser.close();
    console.log(`Bot Run Error: ${error.message}`);
    reject(error);
  }
})

const fetchData = (cin) => new Promise(async (resolve, reject) => {
  let page;
  try {
    page = await pupHelper.launchPage(browser);
    await page.goto(siteLink, {timeout: 0, waitUntil: 'networkidle2'});
    await page.hover('li.paddi#services');
    await page.waitFor(500);
    await page.waitForSelector('.navlinks3 > ul:first-child > li:last-child > ul > li:first-child > a');
    await page.click('.navlinks3 > ul:first-child > li:last-child > ul > li:first-child > a');         // Do the action to open popup window
    // console.log(`Page Loaded ${page.url()}`);

    let imageLoadedOnce = false;
    let base64Img;
    
    // Get Captcha Image
    page.on('response', async (response) => {
      if (response.url().toLowerCase().includes('getcapchaimage.do') && imageLoadedOnce == false) {
        imageLoadedOnce = true;
        const buffer = await response.buffer();
        base64Img = buffer.toString('base64');
        
        // Send Captcha Image to 2captcha for solving
        const captchaResp = await axios.post(captchaUrl, {
          method: "base64",
          key: captchaKey,
          body: base64Img,
          json: 1,
        });
        const captchaId = captchaResp.data.request;
        // console.log(`Request Send to 2captcha, ID: ${captchaId}`);

        // Request recaptcha Solution from 2captcha
        let captchaResp2;
        do {
          await page.waitFor(5000);
          const url = `${captchaRespUrl}${captchaKey}&id=${captchaId}`;
          captchaResp2 = await axios.get(url);
        } while (captchaResp2.data.request == 'CAPCHA_NOT_READY');

        const captchaSolution = captchaResp2.data.request;
        console.log(`Captcha Solution: ${captchaSolution}`);

        await page.waitForSelector('input[name="companyID"]', {timeout: 0});
        await page.type('input[name="companyID"]', cin);
        await page.type('input#userEnteredCaptcha', captchaSolution);

        await Promise.all([
          page.waitForNavigation({timeout: 0, waitUntil: 'load'}),
          page.click('#tdConfirmBtn input[type="submit"]')
        ]);

        await page.waitFor(5000);
        let foundTableSelector;
        if (cin.toLowerCase().startsWith('u')) {
          foundTableSelector = '#companyMasterData table.result-forms > tbody > tr > td:last-child';
        } else if (cin.toLowerCase().startsWith('a')) {
          foundTableSelector = '#llpMasterData table.result-forms > tbody > tr > td:last-child';
        } else if (cin.toLowerCase().startsWith('f')) {
          foundTableSelector = '#foreignCompanyMasterData table.result-forms > tbody > tr > td:last-child';
        }

        const foundTable = await page.$(foundTableSelector);
        if (foundTable) { 
          const fields = await pupHelper.getTxtMultiple(foundTableSelector, page);
          let csvLine = '';
          for (let i = 0; i < fields.length; i++) {
            if (i == fields.length - 1) {
              csvLine+= `"${fields[i].replace(/"/gi, "'")}"`;
            } else {
              csvLine+= `"${fields[i].replace(/"/gi, "'")}",`;
            }
          }

          const chargesTable = await page.$$('#chargesRegistered table.result-forms > tbody > tr:not(:first-child) > td:first-child');
          if (chargesTable) {
            let charges;
            if (chargesTable.length > 1) {
              for (let i = 0; i < chargesTable.length; i++) {
                charges = await page.evaluate(elm => elm.innerText.trim(), chargesTable[i]);
                if (charges !== '') break;
              }
            } else {
              charges = await page.evaluate(elm => elm.innerText.trim(), chargesTable[0]);
            }
            csvLine += `,"${charges.replace(/"/gi, "'")}"`;
          }

          const directorsTable = await page.$('#signatories table.result-forms > tbody > tr:not(:first-child) > td:nth-child(2)');
          if (directorsTable) {
            const directorsIds = await pupHelper.getTxtMultiple('#signatories table.result-forms > tbody > tr:not(:first-child) > td:nth-child(1)', page);
            const directorsNames = await pupHelper.getTxtMultiple('#signatories table.result-forms > tbody > tr:not(:first-child) > td:nth-child(2)', page);
            for (let i = 0; i < directorsNames.length; i++) {
              csvLine+= `,${directorsIds[i].replace(/"/gi, "'")},"${directorsNames[i].replace(/"/gi, "'")}"`;
            }
          }

          // console.log(csvLine)
          writeToCsv('results.csv', csvLine);
          
          console.log(`Company Found...`);
          const reportGoodUrl = `${captchaReportGood}${captchaKey}&id=${captchaId}`;
          await axios.get(reportGoodUrl);
          // await page.close();
          await page.close();
          return resolve(true);
        } else {
          await page.screenshot({path: 'screenshot.png'});
          console.log(`Couldn't fetch company data...`);
          const reportBadUrl = `${captchaReportBad}${captchaKey}&id=${captchaId}`;
          await axios.get(reportBadUrl);
          // await page.close();
          await page.close();
          return resolve(false);
        }
      }
    });
  } catch (error) {
    // if (page) await page.close();
    if (page) await page.close();
    console.log(`fetchData Error: ${error}`);
    resolve(false);
  }
})

async function writeToCsv(filename, data) {
  if (!fs.existsSync(filename)) {
    fs.writeFileSync(filename, '"field01","field02","field03","field04","field05","field06","field07","field08","field09","field10","field11","field12","field13","field14","field15","field16","field17","field18","field19","field20","field21","field22","field23","field24","field25","field26","field27","field28","field29","field30","field31","field32","field33","field34","field35"\n'); 
  }
  fs.appendFileSync(filename, `${data}\n`);
};

const excelToJson = () => new Promise(async (resolve, reject) => {
  try {
    xlsxj({
      input: inputFile, 
      output: "cin.json",
      lowerCaseHeaders: true //converts excel header rows into lowercase as json keys
    }, function(err, result) {
      if (!err) {
        resolve(result);
      }
    });
  } catch (error) {
    console.log(`excelToJson Error: ${error.message}`);
    reject(error)
  }
});

run();
