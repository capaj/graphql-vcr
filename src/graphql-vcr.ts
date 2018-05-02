import glob from 'glob'
import mkdirp from 'mkdirp'
import path from 'path'
import objectFsify from 'object-fsify'
import ms from 'ms'
import mfs from 'mz/fs'
import {
  GraphQLSchema,
  ExecutionResult,
  Source,
  GraphQLFieldResolver
} from 'graphql'
import isEqual from 'lodash.isequal'
import chalk from 'chalk'

export default (opts: {
  graphql: (
    schema: GraphQLSchema,
    source: Source | string,
    rootValue?: any,
    contextValue?: any,
    variableValues?: { [key: string]: any } | void,
    operationName?: string | void,
    fieldResolver?: GraphQLFieldResolver<any, any> | void
  ) => Promise<ExecutionResult>
  schema: GraphQLSchema
  sessionsDir: string
  sessionTimeout: string
  enable?: boolean
}) => {
  const {
    sessionsDir = './vcr-sessions',
    sessionTimeout = '30m',
    enable = true
  } =
    opts || {}
  const newSessionFileName = () =>
    path.join(sessionsDir, `${new Date().toISOString()}.json`)
  let currentSession

  const newSession = () =>
    (currentSession = objectFsify([], newSessionFileName(), { indent: 2 }))

  mkdirp.sync(sessionsDir)
  const fsSessions = glob.sync(path.join(sessionsDir, '*.json'))
  if (!fsSessions.length) {
    newSession()
  } else {
    currentSession = objectFsify([], fsSessions[fsSessions.length - 1], {
      indent: 2
    })
    if (
      +new Date(currentSession[currentSession.length - 1].requestedAt) <
      +new Date() - ms(sessionTimeout)
    ) {
      newSession()
    }
  }

  const vcr = {
    recordRequest() {
      let indexOfRequest
      console.log('recording r112')
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
    async playFile(file, check: boolean = false) {
      return vcr.iterateAndExecute(
        JSON.parse(await mfs.readFile(file, 'utf8')),
        check
      )
    },
    async iterateAndExecute(requests, check: boolean) {
      for (let index = 0; index < requests.length; index++) {
        const req = requests[index]
        console.log(
          chalk.yellow(`replaying req ${index + 1}/${requests.length}`)
        )
        const result = await opts.graphql(
          opts.schema,
          req.query.query,
          null,
          JSON.parse(req.context)
        )
        if (check) {
          if (!isEqual(result, JSON.parse(req.result))) {
            throw new Error(`result from ${req.query} does not match`) // TODO print out a comparison
          }
          console.log(
            chalk.green(
              `finished req ${index + 1}/${requests.length}, result matched`
            )
          )
        } else {
          console.log(
            chalk.green(`finished req ${index + 1}/${requests.length}`)
          )
        }
      }
    },
    async playLastSession(check: boolean = false) {
      if (currentSession.length > 0) {
        vcr.iterateAndExecute(currentSession, check)
      } else {
        vcr.playFile(fsSessions[fsSessions.length - 1], check)
      }
    }
  }
  return vcr
}
