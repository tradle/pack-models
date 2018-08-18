const path = require('path')
const pify = require('pify')
const fs = pify(require('fs'))
const writeFileAtomic = require('write-file-atomic')
const stableStringify = require('json-stable-stringify')

let models
let propNames
let modelNames
if (!propNames)
  propNames = {}
if (!modelNames)
  modelNames = {}

module.exports = { writeDictionary }

async function writeDictionary(modelsDir, lang) {
  let fn = './dictionary_' + lang + '.json'
  modelsDir = path.resolve(modelsDir)

  let files = await fs.readdir(path.resolve(modelsDir))
  files = files.filter(file => /\.json$/.test(file))

  const models = files.map(file => {
      return require(path.join(modelsDir, file))
    })

  Object.keys(models).forEach(id => {
    const m = models[id]
    modelNames[m.id] = modelNames[m.id]  ||  m.title
    for (let p in m.properties) {
      if (p.charAt(0) === '_')
        continue
      if (propNames[p]) {
        if (m.properties[p].title) {
          if (!propNames[p][m.id])
            propNames[p][m.id] = m.properties[p].title
        }

        continue
      }

      propNames[p] = {}

      if (m.properties[p].title)
        propNames[p][m.id] = m.properties[p].title
      else {
        let title = makeLabel(p)
        propNames[p].Default = title
      }
      if (m.properties[p].type === 'array'  &&  m.properties[p].items.properties) {
        let props = m.properties[p].items.properties
        propNames[p].items = {}
        for (let pp in props) {
          if (props[pp].title)
            propNames[p].items[pp] = props[pp].title
          else {
            let title = makeLabel(pp)
            propNames[p].items[pp] = title
          }
        }
      }
    }
  })

  let dictionary = {
    properties: propNames,
    models: modelNames
  }

  writeFileAtomic(fn, stableStringify(dictionary, { space: '  ' }), console.log)
}

function makeLabel(label) {
  return label
        // insert a space before all caps
        .replace(/([A-Z])/g, ' $1')
        // uppercase the first character
        .replace(/^./, str => str.toUpperCase())
}

// function printUsage () {
//   console.log(function () {
//   `
//   Usage:
//   Options:
//       -h, --help              print usage
//       -f, --file              file path where the model resides
//       -m, --model             model json object. Verifies everyhing except references
//       -r, --references        the array of models for which to check the references
//   `
//   }.toString()
//   .split(/\n/)
//   .slice(2, -2)
//   .join('\n'))

//   process.exit(0)
// }
