#!/usr/bin/env node

const splitMerge = require('./index')
splitMerge.merge(process.argv[2], process.argv[3], true)
