#!/usr/bin/env node

const path = require('path')
const { merge, embedValues } = require('./index')
const HELP = `
  Usage:

  build-models --input ./models --output ./models.js --values ./values

  Options:
  --input, -i   path/to/models directory
  --output, -o  path/to/models.js output file
  --values, -i  path/to/values directory (values to embed in models)
  --help, -h    see this menu again
`

const cwd = process.cwd()
const { input, output, values, help } = require('minimist')(process.argv.slice(2), {
  alias: {
    i: 'input',
    o: 'output',
    v: 'values',
    h: 'help'
  },
  // default: {
  //   input: path.join(cwd, 'models'),
  //   output: path.join(cwd, 'models.js'),
  //   values: path.join(cwd, 'values')
  // }
})

if (help) {
  console.log(HELP)
  process.exit(0)
}

if (input && output) {
  console.log('merging models')
  merge(input, output)
}

if (input && values) {
  console.log('embedding values')
  embedValues(input, values)
}
