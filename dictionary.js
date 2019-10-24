const Promise = require('bluebird')
const path = require('path')
const pify = require('pify')
const fs = pify(require('fs'))
const _ = require('lodash')
const Translate = require('@google-cloud/translate')
const aws = require('aws-sdk')
const s3ls = require('s3-ls');

const MODEL = 'model'
const PROPERTY_NAME = 'propertyName'
const DEFAULT = 'Default'
const MAX_LANGUAGES_IN_ONE_SHOT = 1
const BUCKET = 'tradle.io'
const DICTIONARIES_FOLDER = 'dictionaries/'

module.exports = { writeDictionary, writeDictionaries }

const translate = new Translate();
var s3 = new aws.S3()
aws.config.setPromisesDependency(Promise);

async function writeDictionaries({modelsDir, lang, newOnly, all}) {
  if (!process.env.GOOGLE_APPLICATION_CREDENTIALS) {
    console.log('Please set environment variable GOOGLE_APPLICATION_CREDENTIALS to allow models translation')
    return
  }
  if (!process.env.AWS_PROFILE) {
    console.log('Please check if you use the correct AWS_PROFILE')
    return
  }
  let langs, allLanguages
  if (lang  &&  lang !== 'en')
    langs = lang.split(',')
  else {
    allLanguages = true
    let [languages] = await translate.getLanguages()
    langs = languages.map(l => l.code)
  }

  modelsDir = path.resolve(modelsDir)
  let models
  let parts = modelsDir.split('/')
  let dir = parts[parts.length - 2]
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
  let len
  if (langs.length > MAX_LANGUAGES_IN_ONE_SHOT)
    len = MAX_LANGUAGES_IN_ONE_SHOT
  else
    len = langs.length

  let lister = s3ls({bucket: BUCKET});
  let folder = `${DICTIONARIES_FOLDER}${dir}/`
  let fileNames
  try {
    let data = await lister.ls(folder)
    fileNames = data.files
  } catch (err) {
    console.log(err.message, err.stack)
    return
  }

  let i = 0
  while (true) {
    let newLangs = []
    for (j=0; j<len  &&  i<langs.length; i++) {
      let l = langs[i]
      let fn = `${folder}dictionary_${l}.json`
      if (newOnly  &&  fileNames.includes(fn))
        continue

      newLangs.push(l)
      j++
    }
    await Promise.all(newLangs.map(lang => writeDictionary({models, lang, newOnly, dir})))
    if (i === langs.length)
      break
    await timeout(60000)
  }
}
function timeout(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function writeDictionary({models, lang, newOnly, dir}) {
  let fn = `/dictionary_${lang.replace('-', '')}.json`
  if (dir)
    fn = `${dir}${fn}`
  else
    fn = `.${fn}`
  let dfile
  var paramsGet = {
    Bucket: BUCKET,
    Key: `${DICTIONARIES_FOLDER}${fn}`,
   };
  try {
    let res = await s3.getObject(paramsGet).promise()
    dfile = JSON.parse(Buffer.from(res.Body).toString('utf8'))
    if (dfile  && newOnly)
      return
    if (!dfile)
      dfile = []
  } catch (err) {
    console.log(err.message)
    if (err.statusCode !== 404)
      return

    if (!newOnly)
      newOnly = true
    dfile = []
  }

  let currentIds = {}
  dfile.forEach(({ type, model, name, en, description }) => {
    let id
    if (type === MODEL)
      id = [type, name, en].join('_')
    else
      id = [model, name, en].join('_')
    // if (description)
    //   id += `_${description}`
    currentIds[id] = true
  })

  console.log(`Translating to ${lang}`)
  let keys = Object.keys(models)
  let result = await Promise.all(keys.map(id => translateModel({
    model: models[id],
    lang,
    dictionary: dfile,
    currentIds
  })), { concurrency: 20 })

  // Check if some models/props were deleted
  let hasChanged
  let newIds = {}
  result.forEach(r => {
    _.extend(newIds, r.newIds)
    if (r.changed)
      hasChanged = true
  })
  for (let p in currentIds) {
    if (newIds[p])
      continue
    let parts = p.split('_')
    let filter, idx
    if (parts[0] === MODEL)
      filter = {type: MODEL, name: parts[1], en: parts[2]}
    else
      filter = {model: parts[0], name: parts[1], en: parts[2]}
    idx = _.findIndex(dfile, filter)
    let rm = dfile.splice(idx, 1)
    hasChanged = true
  }
  if (!hasChanged  &&  !newOnly)
    return
  dfile.sort((a, b) => {
    return a.en > b.en
  })

  var paramsPut = {
    Body: Buffer.from(JSON.stringify(dfile, 0, 2)),
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

const translateModel = async ({ model, dictionary, lang, currentIds }) => {
  const m = model
  const { id } = m

  if (!m  ||  !m.title || !id)
    debugger
  let mid = ['model', id, m.title].join('_')

  let newIds = {[mid]: true}

  let hasChanged
  if (!currentIds[mid]) {
    hasChanged = true
    let obj = await addToDictionary({ dictionary, model, title: m.title, lang })
    if (m.enum) {
      obj.enum = {}
      m.enum.forEach(async ({id, title}) => {
        obj.enum[id] = await translateText(title, lang)
      })
    }
  }
  else if (m.enum) {
    let idx = dictionary.findIndex(r => r.type === 'model'  &&  r.name === m.id)
    let obj = dictionary[idx]
    if (obj.enum.length !== m.enum.length) {
      hasChanged = true
      for (let i=0; i<m.enum.length; i++) {
        let { id, title } = m.enum[i]
        if (!obj.enum[id])
          obj.enum[id] = await translateText(title, lang)
      }
    }
  }
  let props = m.properties
  for (let p in props) {
    if (p.charAt(0) === '_')
      continue

    let { title, description } = props[p]
    let pid, notDefault
    if (title) {
      pid = [id, p, title].join('_')
      notDefault = true
      // if (description)
      //   pid += `_${description}`
    }
    else {
      title = makeLabel(p)
      pid = [description &&  id || DEFAULT, p, title].join('_')
      if (description) {
        notDefault = true
        // pid += `_${description}`
      }
    }
    newIds[pid] = true
    if (!currentIds[pid]) {
      currentIds[pid] = true
      hasChanged = true
      await addToDictionary({dictionary, model: notDefault && model, propertyName: p, description, title, lang})
    }
  }
  return { changed: hasChanged, newIds }
}
async function addToDictionary({dictionary, model, propertyName, title, description, lang}) {
  let obj = {
    [lang]: await translateText(title, lang),
    en: title,
    name: propertyName || model.id,
    type: propertyName && PROPERTY_NAME || MODEL,
  }
  if (propertyName)
    obj.model = model  &&  model.id || DEFAULT
  if (description)
    obj.description = await translateText(description, lang)
  dictionary.push(obj)
  return obj
}
async function translateText(text, lang) {
  if (lang === 'en')
    return text
  const results = await translate.translate(text, lang)
  let translations = results[0];
  translations =  translations.charAt(0).toUpperCase() + translations.slice(1)
  return Array.isArray(translations) ? translations[0] : translations
}

function makeLabel(label) {
  return label
        // insert a space before all caps
        .replace(/([A-Z])/g, ' $1')
        // uppercase the first character
        .replace(/^./, str => str.toUpperCase())
}

