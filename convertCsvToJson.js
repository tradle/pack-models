const Promise = require('bluebird')
const path = require('path')
const pify = require('pify')
const fs = pify(require('fs'))
const _ = require('lodash')

const aws = require('aws-sdk')
const s3ls = require('s3-ls');

const MODEL = 'model'
const PROPERTY_NAME = 'propertyName'
const DEFAULT = 'Default'
const MAX_LANGUAGES_IN_ONE_SHOT = 1
const BUCKET = 'tradle.io'
const DICTIONARIES_FOLDER = 'dictionaries/'

module.exports = { convertToJson }

var s3 = new aws.S3()
aws.config.setPromisesDependency(Promise);

async function convertToJson({file, lang}) {
  if (!lang) {
    let parts = file.split('.')
    if (parts.length !== 2  ||  parts[1].toLowerCase() !== 'csv') {
      console.log('the -f options should pass CSV file with ".cvs" extension')
      return
    }

    let fnParts = parts[0].split('_')
    if (fnParts.length < 2) {
      console.log('file name should be like dictionary_es.csv. The _es is for language')
      return
    }
    lang = fnParts[1]
  }
  file = path.resolve(file)

  let lines = fs.readFileSync(file, { encoding: 'utf8' })
    .toString()
    .split('\n')

  let headers=lines[0].split(",").map(h => h.charAt(0) === '"' ? h.slice(1, -1) : h)

  let result = []
  for(let i=1; i<lines.length; i++){

    let obj = {};
    if (!lines[i].length)
      continue
    let currentline=lines[i].split(",");

    for(let j=0;j<headers.length;j++) {
      let val = currentline[j]
      if (!val.length || val === '""')
        continue
      obj[headers[j]] = val.charAt(0) === '"' ? val.slice(1, -1) : val
    }

    result.push(obj);
  }
  let fileDir = path.resolve(file)
  debugger
  let parts = fileDir.split('/')

  let dir = parts[parts.length - 2]

  let fn = `/dictionary_${lang.replace('-', '')}.json`
  if (dir)
    fn = `${dir}${fn}`
  else
    fn = `.${fn}`

  var paramsPut = {
    Body: Buffer.from(JSON.stringify(result, 0, 2)),
    Bucket: BUCKET,
    Key: `${DICTIONARIES_FOLDER}${fn}`,
    ACL: 'public-read'
   };
   s3.putObject(paramsPut, function(err, data) {
     if (err)
       console.log(err, err.stack); // an error occurred
     else
       console.log(data);           // successful response
   });
}
