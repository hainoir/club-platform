'use strict'

const fs = require('node:fs')

const clockFile = process.env.VERIFY_DUTY_CLOCK_FILE
if (!clockFile) {
  return
}

const raw = fs.readFileSync(clockFile, 'utf8').trim()
const fixed = Date.parse(raw)
if (Number.isNaN(fixed)) {
  throw new Error(`VERIFY_DUTY_CLOCK_FILE ${clockFile} is not a timestamp: ${raw}`)
}

const OriginalDate = Date
const startedAt = OriginalDate.now()

function shiftedNow() {
  return fixed + (OriginalDate.now() - startedAt)
}

function ShiftedDate(...args) {
  if (!new.target) {
    return new OriginalDate(shiftedNow()).toString()
  }
  if (args.length === 0) {
    return new OriginalDate(shiftedNow())
  }
  return new OriginalDate(...args)
}

ShiftedDate.prototype = OriginalDate.prototype
ShiftedDate.now = shiftedNow
ShiftedDate.parse = OriginalDate.parse
ShiftedDate.UTC = OriginalDate.UTC
Object.setPrototypeOf(ShiftedDate, OriginalDate)

global.Date = ShiftedDate
