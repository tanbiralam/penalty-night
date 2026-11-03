import { createServer } from 'node:http'
import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const ROOT = path.resolve(fileURLToPath(new URL('./dist/', import.meta.url)))
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml' }

createServer(async (request, response) => {
	const pathname = new URL(request.url, 'http://localhost').pathname
	const filename = path.resolve(ROOT, `.${pathname === '/' ? '/index.html' : pathname}`)
	if (!filename.startsWith(`${ROOT}${path.sep}`)) {
		response.writeHead(403).end()
		return
	}
	try {
		const body = await readFile(filename)
		response.writeHead(200, {
			'Content-Type': TYPES[path.extname(filename)] ?? 'text/plain',
			'Cache-Control': 'no-store',
		}).end(body)
	} catch {
		response.writeHead(404).end('Not found')
	}
}).listen(5300, '127.0.0.1', () => {
	console.log('Local: http://127.0.0.1:5300')
})
