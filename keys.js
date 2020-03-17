const path = require('path');

module.exports = {
    siteLink: 'http://www.mca.gov.in/mcafoportal/viewCompanyMasterData.do',
    // siteLink: 'http://www.mca.gov.in/mcafoportal/companyLLPMasterData.do',
    inputFile: 'cins.xlsx',
    captchaUrl: 'https://2captcha.com/in.php',
    captchaRespUrl: `https://2captcha.com/res.php?json=1&action=get&key=`,
    captchaKey: 'edff3992e423b9d8e42deea14655d139',
    captchaReportBad: 'https://2captcha.com/res.php?action=reportbad&key=',
    captchaReportGood: 'https://2captcha.com/res.php?action=reportgood&key=',
    retryAttempts: 3
}