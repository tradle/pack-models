#!/usr/bin/env node

/* eslint-disable no-console,max-len,no-process-exit */

const { merge, embedValues } = require('./index')
const { writeDictionaries } = require('./dictionary')
const { convertToJson } = require('./convertCsvToJson')
const HELP = `
  Usages:

  build-models --input ./models --output ./models.js --values ./values

  Options:
  --input, -i   path/to/models directory
  --output, -o  path/to/models.js output file
  --array, -a   export array of models instead of id->model map
  --values, -i  path/to/values directory (values to embed in models)
  --help, -h    see this menu again
  --dictionary, -d  path/to/models directory
  --languages,  -l comma separated languages like: es,fr,fil,nl
  --newOnly,    -n new languages only
  --file,       -f convertToJson
`

const argv = require('minimist')(process.argv.slice(2), {
  alias: {
    i: 'input',
    o: 'output',
    v: 'values',
    h: 'help',
    d: 'dictionary',
    l: 'languages',
    n: 'newOnly',
    f: 'file'
  }
})

const { input, output, values, help, dictionary, languages, file, array, newOnly } = argv
if (help) {
  console.log(HELP)
  process.exit(0)
}
const tasks = []

if (file) {
  if (!dictionary) {
    console.log('\'dictionary\' should be passed for converting to JSON')
    process.exit(0)
  }
  console.log(`generate dictionary: ${dictionary}`)
  tasks.push(convertToJson({ modelsDir: dictionary, file, lang: languages }))
}
if (dictionary) {
  console.log(`generate dictionary: ${dictionary}`)
  tasks.push(writeDictionaries({ modelsDir: dictionary, lang: languages || 'en', newOnly }))
}
if (input && values) {
  console.log('embedding values')
  tasks.push(embedValues(input, values))
}

if (input && output) {
  console.log('merging models')
  tasks.push(merge(input, output, array))
}

Promise.all(tasks).catch((err) => {
  console.error(err.stack)
  process.exitCode = 1
})
