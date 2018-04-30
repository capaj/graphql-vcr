const glob = require('glob')
const fs = require('fs')
const mkdirp = require('mkdirp')
const path = require('path')
const objectFsify = require('object-fsify')
const ms = require('ms')
const mfs = require('mz/fs')
const { graphql } = require('graphql')
const isEqual = require('lodash.isequal')
const chalk = require('chalk')

module.exports = opts => {
  const {
    sessionsDir = './vcr-sessions',
    sessionTimeout = '30m',
    schema,
    enable = true
  } =
    opts || {}
  const newSessionFileName = () =>
    path.join(sessionsDir, `${new Date().toISOString()}.json`)
  let currentSession

  const newSession = () =>
    (currentSession = objectFsify([], newSessionFileName(), { indent: 2 }))
  mkdirp.sync(sessionsDir)
  const existing = glob.sync(path.join(sessionsDir, '*.json'))
  if (!existing.length) {
    newSession()
  } else {
    currentSession = objectFsify([], existing[existing.length - 1], {
      indent: 2
    })
    if (
      new Date(currentSession[currentSession.length - 1].requestedAt) <
      new Date() - ms(sessionTimeout)
    ) {
      newSession()
    }
  }

  return {
    recordRequest() {
      let indexOfRequest
      return {
        query(query, context) {
          if (enable) {
            indexOfRequest = currentSession.push({
              query,
              context: JSON.stringify(context),
              requestedAt: new Date()
            })
          }
        },
        result(result) {
          if (enable) {
            currentSession[indexOfRequest - 1].result = result
          }
        }
      }
    },
    async play(file) {
      const requests = JSON.parse(await mfs.readFile(file, 'utf8'))
      for (let index = 0; index < requests.length; index++) {
        const req = requests[index]
        console.log(
          chalk.yellow(`replaying req ${index + 1}/${requests.length}`)
        )
        await graphql(schema, req.query.query, null, JSON.parse(req.context))

        console.log(chalk.green(`finished req ${index + 1}/${requests.length}`))
      }
    },
    async playAndCheck(file) {
      const requests = JSON.parse(await mfs.readFile(file, 'utf8'))
      for (let index = 0; index < requests.length; index++) {
        const req = requests[index]
        console.log(
          chalk.yellow(`replaying req ${index + 1}/${requests.length}`)
        )
        const result = await graphql(
          schema,
          req.query.query,
          null,
          JSON.parse(req.context)
        )
        if (!isEqual(result, JSON.parse(req.result))) {
          throw new Error(`result from ${req.query} does not match`) // TODO print out a comparison
        }
        console.log(chalk.green(`finished req ${index + 1}/${requests.length}`))
      }
    }
  }
}
