const path = require('path');

module.exports = {
    // siteLink: 'http://www.mca.gov.in/mcafoportal/viewCompanyMasterData.do',
    siteLink: 'http://www.mca.gov.in/MinistryV2/',
    inputFile: 'cins.xlsx',
    captchaUrl: 'https://2captcha.com/in.php',
    captchaRespUrl: `https://2captcha.com/res.php?json=1&action=get&key=`,
    captchaKey: '',
    captchaReportBad: 'https://2captcha.com/res.php?action=reportbad&key=',
    captchaReportGood: 'https://2captcha.com/res.php?action=reportgood&key=',
    retryAttempts: 3
}
