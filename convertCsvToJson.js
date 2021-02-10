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

async function convertToJson({modelsDir, file, lang}) {
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

  modelsDir = path.resolve(modelsDir)
  let models
  let dparts = modelsDir.split('/')
  let dir = dparts[dparts.length - 2]
  if (modelsDir.indexOf('.json') === -1) {
    let files = await fs.readdir(modelsDir)
    files = files.filter(file => /\.json$/.test(file))

    models = files.map(file => {
      return require(path.join(modelsDir, file))
    })
  }
  else {
    let ddir = path.resolve(dir)
    if (!fs.existsSync(ddir))
      fs.mkdirSync(ddir)
    models = require(modelsDir)
  }
  if (Array.isArray(models)) {
    let m = {}
    models.forEach(model => {
      m[model.id] = model
    })
    models = m
  }
  file = path.resolve(file)

  let lines = fs.readFileSync(file, { encoding: 'utf8' })
    .toString()
    .split('\n')

  let headers = lines[0].split(",").map(h => h.charAt(0) === '"' ? h.slice(1, -1) : h)

  let enumStart = headers.findIndex(h => !h.length)
  let isModelIdx = headers.findIndex(h => h === 'isModel')
  let modelIdx = headers.findIndex(h => h === 'model')
  let nameIdx = headers.findIndex(h => h === 'name')
  let translatedIdx = headers.findIndex(h => h === lang)

  let result = []
  for (let i=1; i<lines.length; i++) {
    let obj = {};
    if (!lines[i].length)
      continue
    let currentline = lines[i].split(",");
    let isModel = currentline[isModelIdx]

    let modelId = !isModel  &&  currentline[modelIdx]
    let model
    if (modelId) {
      modelId = stripQuotes(modelId)
      model = models[modelId]
    }

    let isEnum = model &&  model.enum
    let name = stripQuotes(currentline[nameIdx])
    let translatedTitle = stripQuotes(currentline[translatedIdx])
    if (isEnum  &&  !isModel) {
      let elm = result.find(r => r.name === modelId)
      if (!elm.enum)
        elm.enum = {}
      elm.enum[name] = translatedTitle
      continue
    }
    for (let j=0; j<headers.length; j++) {
      if (headers[j] === 'isModel') {
        obj.type = isModel && 'model' || 'propertyName'
        continue
      }
      if (headers[j] === 'model') {
        if (modelId)
          obj.model = modelId
        continue
      }
      if (headers[j] === 'name') {
        obj.name = name
        continue
      }
      let val = currentline[j]
      if (!val.length || val === '""')
        continue
      obj[headers[j]] = stripQuotes(val)
    }

    result.push(obj);
  }
  let fileDir = path.resolve(file)
  debugger
  let parts = fileDir.split('/')

  let dir1 = parts[parts.length - 2]

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
function stripQuotes(val) {
  return val.charAt(0) === '"' ? val.slice(1, -1) : val
}