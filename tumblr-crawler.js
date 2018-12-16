const request = require('request-promise-native');
const fs = require('fs');
const puppeteer = require('puppeteer');
const walk = require('walk');
const async = require('async');
const download = require('download');

// Set up the scraper
const emailaddress = 'xxx@xxxx.xxxx';
const password = 'xxxxxxx';
const entryPoint = 'https://www.tumblr.com/likes';

// Set up the directories
const scrapedHtmlPath = [__dirname, 'scraped-html'].join('/');
const downloadsPath = [__dirname, 'downloads'].join('/');

[scrapedHtmlPath, downloadsPath].forEach(path => {
  if (!fs.existsSync(path)) fs.mkdirSync(path);
});

// Scrape the HTML
var browser, page;

(async () => {
  browser = await puppeteer.launch({headless: false});
  page = await browser.newPage();
  await page.goto('https://www.tumblr.com/login', {waitUntil: 'load'});
  await page.type('#signup_determine_email', emailaddress);
  await page.click('#signup_forms_submit');
  await page.waitFor(1000);
  await page.click('#signup_magiclink .forgot_password_link');
  await page.type('#signup_password', password);
  await page.click('#signup_forms_submit');
  await page.waitForNavigation();
  await page.goto(entryPoint, {waitUntil: 'load'});
  getPage();
})();

const getPage = async () => {
  console.log('New Page URL:', page.url());
  await page.waitFor(500 + Math.random() * 1000);
  let bodyHTML = await page.evaluate(() => document.body.innerHTML);
  store(bodyHTML);
  await page.evaluate(_ => { window.scrollBy(0, window.innerHeight); });
  await page.waitFor(500 + Math.random() * 500);
  await page.evaluate(_ => { window.scrollBy(0, document.body.scrollHeight); });
  await page.waitFor(500 + Math.random() * 500);
  if (await page.$('#next_page_link') !== null) await page.click('#next_page_link');
  else { await doneScraping(); return; }
  await page.waitFor(500 + Math.random() * 1000);
  getPage();
};

const store = (html) => {
  var path = [scrapedHtmlPath, new Date().getTime()].join('/');
  fs.writeFileSync(path, html);
};

const doneScraping = async () => {
  await browser.close();
  console.log('Scraping finished, extracting resources');
  startExtraction();
};

// Download the resources
var files = [];
const expr = /"https:\/\/(.*?)"/gm;

const startExtraction = () => {
  var walker = walk.walk(scrapedHtmlPath);

  walker.on('file', (root, fileStats, next) => {
    var path = [scrapedHtmlPath, fileStats.name].join('/');
    var content = fs.readFileSync(path, 'utf8');
    var urls = content.match(expr);
    urls
      .map(url => url.replaceAll('"', ''))
      .filter((url) => { return (url.indexOf('video_file') > -1 || url.endsWith('png') || url.endsWith('jpg') || url.endsWith('gif') || url.endsWith('mp4')); })
      .forEach(url => { if (files.indexOf(url) < 0) files.push(url); });
    next();
  });

  walker.on('end', () => {
    console.log(`Found ${files.length} unique files, preparing downloads`);
    async.eachOfLimit(files, 10, startDownload, () => {
      console.log('Downloads completed');
    });
  });
};

const startDownload = (file, key, callback) => {
  if (file.indexOf('video_file') > -1) downloadVideo(file, key, callback);
  else downloadImage(file, key, callback);
};

const downloadImage = (file, key, callback) => {
  var filename = file.split('/').reverse()[0];
  if (checkIfExists(filename, key)) { callback(); return; }
  download(file, 'downloads').then(() => {
    console.log(`${key + 1}/${files.length} - DOWNLOADED - ${file}`);
    callback();
  }).catch(() => {
    callback();
  });
};

const downloadVideo = (file, key, callback) => {
  var filename = file.split('/').reverse()[0] + '.mp4';
  if (checkIfExists(filename, key)) { callback(); return; }
  download(`https://vtt.tumblr.com/${filename}`, 'downloads').then(() => {
    console.log(`${key + 1}/${files.length} - DOWNLOADED - ${file}`);
    callback();
  }).catch(() => {
    callback();
  });
};

const checkIfExists = (file, key) => {
  if (fs.existsSync([downloadsPath, file].join('/'))) {
    console.log(`${key + 1}/${files.length} - EXISTS - ${file}`);
    return true;
  }
  return false;
};

String.prototype.replaceAll = function (search, replacement) {
  var target = this;
  return target.replace(new RegExp(search, 'g'), replacement);
};
