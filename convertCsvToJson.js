const Promise = require('bluebird')
const path = require('path')
const pify = require('pify')
const fs = pify(require('fs'))

const aws = require('aws-sdk')

const BUCKET = 'tradle.io'
const DICTIONARIES_FOLDER = 'dictionaries/'

module.exports = { convertToJson }

const s3 = new aws.S3()
aws.config.setPromisesDependency(Promise);

async function convertToJson ({modelsDir, file, lang}) {
  if (!lang) {
    const parts = file.split('.')
    if (parts.length !== 2 || parts[1].toLowerCase() !== 'csv') {
      console.log('the -f options should pass CSV file with ".cvs" extension')
      return
    }

    const fnParts = parts[0].split('_')
    if (fnParts.length < 2) {
      console.log(
        'file name should be like dictionary_es.csv. The _es is for language'
      )
      return
    }
    // eslint-disable-next-line prefer-destructuring
    lang = fnParts[1]
  }

  modelsDir = path.resolve(modelsDir)
  let models
  const dparts = modelsDir.split('/')
  const dir = dparts[dparts.length - 2]
  if (modelsDir.indexOf('.json') === -1) {
    let modelFiles = await fs.readdir(modelsDir)
    modelFiles = modelFiles.filter(modelFile => (/\.json$/).test(modelFile))

    models = modelFiles.map(modelFile => {
      return require(path.join(modelsDir, modelFile))
    })
  } else {
    const ddir = path.resolve(dir)
    if (!fs.existsSync(ddir))
      fs.mkdirSync(ddir)
    models = require(modelsDir)
  }
  if (Array.isArray(models)) {
    const m = {}
    models.forEach(model => {
      m[model.id] = model
    })
    models = m
  }
  file = path.resolve(file)

  const lines = fs.readFileSync(file, { encoding: 'utf8' })
    .toString()
    .split('\n')

  const headers = lines[0].split(',').map(h => {
    return h.charAt(0) === '"' ? h.slice(1, -1) : h
  })

  const isModelIdx = headers.findIndex(h => h === 'isModel')
  const modelIdx = headers.findIndex(h => h === 'model')
  const nameIdx = headers.findIndex(h => h === 'name')
  const translatedIdx = headers.findIndex(h => h === lang)

  const result = []
  for (let i=1; i<lines.length; i += 1) {
    const obj = {};
    if (!lines[i].length)
      continue
    const currentline = lines[i].split(',')
    const isModel = currentline[isModelIdx]

    let modelId = !isModel && currentline[modelIdx]
    let model
    if (modelId) {
      modelId = stripQuotes(modelId)
      model = models[modelId]
    }

    const isEnum = model && model.enum
    const name = stripQuotes(currentline[nameIdx])
    const translatedTitle = stripQuotes(currentline[translatedIdx])
    if (isEnum && !isModel) {
      const elm = result.find(r => r.name === modelId)
      if (!elm.enum)
        elm.enum = {}
      elm.enum[name] = translatedTitle
      continue
    }
    for (let j=0; j<headers.length; j += 1) {
      if (headers[j] === 'isModel') {
        obj.type = isModel ? 'model' : 'propertyName'
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
      const val = currentline[j]
      if (!val.length || val === '""')
        continue
      obj[headers[j]] = stripQuotes(val)
    }

    result.push(obj);
  }

  let fn = `/dictionary_${lang.replace('-', '')}.json`
  if (dir)
    fn = `${dir}${fn}`
  else
    fn = `.${fn}`

  const paramsPut = {
    Body: Buffer.from(JSON.stringify(result, 0, 2)),
    Bucket: BUCKET,
    Key: `${DICTIONARIES_FOLDER}${fn}`,
    ACL: 'public-read'
   };
   s3.putObject(paramsPut, (err, data) => {
      if (err) {
        // An error occurred
        console.log(err, err.stack)
      } else {
        // Successful response
        console.log(data)
      }
   });
}

function stripQuotes (val) {
  return val.charAt(0) === '"' ? val.slice(1, -1) : val
}
