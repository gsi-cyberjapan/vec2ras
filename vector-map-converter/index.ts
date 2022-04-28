import { chromium, Browser, BrowserContext } from 'playwright'
import * as http from 'http'
import { randomUUID } from 'crypto'
import * as fs from 'fs'
import PQueue from 'p-queue'

let _concurrency = 4
if (process.env.CONCURRENCY) {
  _concurrency = parseInt(process.env.CONCURRENCY)
}
const concurrency = _concurrency

const queue = new PQueue({concurrency: concurrency})

console.log('queue is set:', concurrency)

const tile2long = (x: number, z: number): number => {
  return x / 2 ** z * 360 - 180
}

const tile2lat = (y: number, z: number): number => {
  const n = Math.PI - 2 * Math.PI * y / 2 ** z
  return 180 / Math.PI * Math.atan(0.5 * (Math.exp(n) - Math.exp(-n)))
}

let browser: Browser
let context_1: BrowserContext
let context_2: BrowserContext
let context_3: BrowserContext
(async () => {
  browser = await chromium.launch({ headless: true })
  console.log('browser is initialized')
  context_1 = await browser.newContext({
    viewport: {
      width: 256 + 256,
      height: 256 + 256
    }
  })
  context_2 = await browser.newContext({
    viewport: {
      width: 512 + 256,
      height: 512 + 256
    }
  })
  context_3 = await browser.newContext({
    viewport: {
      width: 768 + 256,
      height: 768 + 256
    }
  })
  console.log('new browser context is initalized')
})()

const diff = (start_time: number): number => {
  return (new Date().getTime()) - start_time
}

const jumpInto = async (site: string, z: number, x: number, y: number, power: number): Promise<string> => {
  const session = randomUUID()
  console.log('start session:', session, 'params:', z, x, y, power)
  const start_time = new Date().getTime()
  let context: BrowserContext
  let new_z = z
  if (power == 1) {
    new_z = new_z - 1
    context = context_1
    console.log(session, 'using context_1')
  } else if (power == 2) {
    context = context_2
    console.log(session, 'using context_2')
  } else if (power == 3) {
    new_z = new_z + 0.5
    context = context_3
    console.log(session, 'using context_3')
  } else {
    return '404_1.png'
  }
  const webpage = `${site}#${new_z}/${tile2lat(y + 0.5, z)}/${tile2long(x + 0.5, z)}`
  console.log(webpage, session)
  const size = 256 * power
  console.log('before: ', session, diff(start_time), 'ms')
  const page = await context.newPage()
  console.log('newPage: ', session, diff(start_time), 'ms')
  await page.goto(webpage, {timeout: 0})
  console.log('page.goto: ', session, diff(start_time), 'ms')
  try {
    await page.waitForNavigation()
    console.log('page.waitForNavigation: ', session, diff(start_time), 'ms')
  } catch (e) {
    console.warn(e)
    return `404_${power}.png`
  }
  const selector = "#checker"
  await page.waitForFunction(selector => !!document.querySelector(selector), selector, {timeout: 0})
  console.log('page.waitForFunction: ', session, diff(start_time), 'ms')
  //await page.waitForLoadState('networkidle')
  //await page.waitForTimeout(20000) // 3000ms is fail to render font
  const filename = randomUUID()
  const path = `files/${filename}.png`
  console.log(path)
  await page.screenshot({
    path: path,
    clip: {
      x: 128,
      y: 128,
      width: size,
      height: size
    }
  })
  console.log('page.screenshot: ', session, diff(start_time), 'ms')
  await page.close()
  console.log('page.close: ', session, diff(start_time), 'ms')
  return path
}

const parseURL = (url: string): [string, number, number, number, number] => {
  const paths = url.split('/')
  const base = paths[2]
  const z = parseInt(paths[3])
  const x = parseInt(paths[4])
  const y_filename = paths[5]
  const y_base = y_filename.split('.')[0]
  let power = 1
  let y: number
  if (y_base.indexOf("@") > 0) {
    y = parseInt(y_base.split("@")[0])
    power = parseInt(y_base.split("@")[1])
  } else {
    y = parseInt(y_base)
  }
  return [base, z, x, y, power]
}

const queueScraper = async (site: string, z: number, x: number, y: number, power: number) => {
  return queue.add(() => jumpInto(site, z, x, y, power))
}

const server = http.createServer()
server.on('request', async (req, res) => {
  if (req.url === undefined) {
    res.writeHead(200)
    res.end()
    return
  }
  if (req.url == '/favicon.ico') {
    res.writeHead(200)
    res.end()
    return
  }
  if (req.url.indexOf('xyz') < 0) {
    res.writeHead(200)
    res.end()
    return
  }
  if (req.url.indexOf(".png") < 0) {
    res.writeHead(200)
    res.end()
    return
  }
  const paths = parseURL(req.url)
  const base = paths[0]
  const site = `http://static/${base}/`
  const z = paths[1]
  const x = paths[2]
  const y = paths[3]
  const power = paths[4]
  const path = await queueScraper(site, z, x, y, power)
  //const path = await jumpInto(site, x, y, z, power)
  res.writeHead(200, {
    'Content-Type': 'image/png; charset=utf-8'
  })
  const image = fs.readFileSync(path, 'binary')
  if (path.indexOf('404_') < 0) {
    fs.unlinkSync(path)
  }
  res.end(image, 'binary')
})

server.listen(3000)

process.on('SIGTERM', async () => {
  server.close()
  await browser.close()
})