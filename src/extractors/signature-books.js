const argv = require('minimist')(process.argv.slice(2));
const select = require('xpath.js');
const DOMParser = require('xmldom').DOMParser;
const fs = require('fs');
const path = require('path');
const _ = require('lodash');
const Promise = require('bluebird');

const { JSDOM } = require("jsdom");

function extractChapter(file) {
    return JSDOM.fromURL(file)
        .then(dom => dom.serialize())
        .then(html => html.replace(/-?\[p\.\d+\]-?/igm, ''))
        .then(html => new JSDOM(html))
        .then(dom => dom.window.document.querySelector('div.entry > p'))
        .then(element => {
            const paragraphs = [];
            while (element) {
                paragraphs.push(element.innerHTML);
                element = element.nextElementSibling;
            }
            return paragraphs;
        })
        .then(paragraphs => {
            // are there footnotes?
            const last = _.last(paragraphs);
            const footnoteRE = /^\s*(\d+)\.?\s*<a\s*name\s*=\s*"\1"\s*>\s*<\/a>\s*(.*)\s*$/im
            const match = last.match(footnoteRE);
            if (!match) {
                return paragraphs;
            }

            // if so, how many?
            let footnoteCount = 0;
            let foundFirstFootnote = false;

            while (footnoteCount < paragraphs.length && 
                !paragraphs[paragraphs.length - footnoteCount - 1].match(/^\s*1\.?\s*<a name/)) {
                footnoteCount++;
            }
            footnoteCount++;

            if (footnoteCount >= paragraphs.length) {
                return Promise.reject('Too many footnotes found.');
            }

            // break out the footnotes from the paragraphs
            const footnotes = paragraphs.splice(paragraphs.length - footnoteCount, paragraphs.length);
            
            // drop the "Notes:"
            paragraphs.pop();
            // drop the "title/author"
            paragraphs.shift();
            
            const title = paragraphs.shift();
            
            // extract the title number
            const titleMatch = title.match(/^Chapter (\d+)\.[\s\S]*$/im);
            const chpCnt = parseInt(titleMatch[1], 10);

            if (!titleMatch || isNaN(chpCnt)) {
                return Promise.reject(`invalid title: ${title}`);
            }
            
            // rebuild the footnote references
            return Promise.resolve({
                title,
                number: chpCnt,
                paragraphs: paragraphs.map(p => p.replace(
                    /<a href="#(\d+)"><sup>\1<\/sup><\/a>/g, 
                    `<a href="#${chpCnt}_$1" name="${chpCnt}_$1_b"><sup>$1<\/sup><\/a>`)),
                footnotes: footnotes.map(f => f.replace(
                    /^(\d+)\.?\s*<a name="\1"><\/a>/, 
                    `<a name="${chpCnt}_$1" href="#${chpCnt}_$1_b">$1.<\/a>`))
            });
        });
}

const getBookContents = function () {
    const basePath = path.join(__dirname, '..', '..', 'tmp');
    
    return Promise.mapSeries([
        'http://signaturebookslibrary.org/power-from-on-high-01-2/',
        'http://signaturebookslibrary.org/power-from-on-high-02/',
        'http://signaturebookslibrary.org/power-from-on-high-03/',
        'http://signaturebookslibrary.org/power-from-on-high-04/',
        'http://signaturebookslibrary.org/power-from-on-high-05/',
        'http://signaturebookslibrary.org/power-from-on-high-06/',
        'http://signaturebookslibrary.org/power-from-on-high-07/',
        'http://signaturebookslibrary.org/power-from-on-high-08/',
    ], extractChapter)
        .then((chapters) => Promise.resolve({
            title: 'Power from on High',
            author: 'Gregory A. Prince',
            chapters
        }));
};
    
_.assign(module.exports, {
    getBookContents
});
