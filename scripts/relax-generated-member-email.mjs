// The admin member form does not collect email. Keep Insert.email optional
// after `supabase gen types`, matching the previous handwritten types.
// The column stays NOT NULL; the auth trigger always writes it.
import fs from "node:fs"

const file = new URL("../types/supabase.ts", import.meta.url)
const source = fs.readFileSync(file, "utf8")
const marker = '},"members": {'
const start = source.indexOf(marker)
if (start < 0) {
  console.error("members table type was not found in types/supabase.ts")
  process.exit(1)
}
const insertKey = source.indexOf("Insert: {", start)
const updateKey = source.indexOf("Update: {", insertKey)
if (insertKey < 0 || updateKey < 0) {
  console.error("members Insert block was not found in types/supabase.ts")
  process.exit(1)
}
const insertBlock = source.slice(insertKey, updateKey)
const nextInsertBlock = insertBlock.replace('"email": string', '"email"?: string')
if (nextInsertBlock === insertBlock) {
  console.error("members Insert.email was not required; nothing to relax")
  process.exit(1)
}
fs.writeFileSync(file, source.slice(0, insertKey) + nextInsertBlock + source.slice(updateKey))
