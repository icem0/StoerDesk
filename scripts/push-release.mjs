#!/usr/bin/env node
// Pushes the current branch and every version tag the remote does not have yet.
//
//   npm run release:push
//
// GitHub creates no tag push event when more than three tags are pushed at once
// ("Events will not be created for tags when more than three tags are pushed at
// once"), and the quality gates hang on that event. A batch push of several tags
// therefore leaves the older commits without a check run and without published
// images. This script pushes the branch first and every missing tag in its own
// push, so every commit gets its own run.
//
// A tag is pushed only when its commit is contained in the pushed branch; a tag of
// an abandoned line of history stays local.

import { execFileSync } from 'node:child_process'

const remote = process.argv[2] ?? 'origin'
const VERSION_TAG = /^v\d+\.\d+\.\d+$/

function git(args) {
  return execFileSync('git', args, { encoding: 'utf8' }).trim()
}

function localTags() {
  return git(['tag', '--list', '--sort=version:refname', 'v[0-9]*'])
    .split('\n')
    .filter((tag) => VERSION_TAG.test(tag))
}

function mergedTags(branch) {
  return git(['tag', '--merged', branch, '--list', '--sort=version:refname', 'v[0-9]*'])
    .split('\n')
    .filter((tag) => VERSION_TAG.test(tag))
}

function remoteTags() {
  const names = new Set()
  const output = git(['ls-remote', '--tags', '--refs', remote])

  for (const line of output.split('\n')) {
    const ref = line.split('\t')[1]

    if (ref?.startsWith('refs/tags/')) {
      names.add(ref.slice('refs/tags/'.length))
    }
  }

  return names
}

function push(refspec) {
  execFileSync('git', ['push', remote, refspec], { stdio: 'inherit' })
}

function main() {
  const branch = git(['rev-parse', '--abbrev-ref', 'HEAD'])

  if (branch === 'HEAD') {
    throw new Error('HEAD is detached - check out the branch to push')
  }

  const headTags = git(['tag', '--points-at', 'HEAD']).split('\n').filter(Boolean)

  if (headTags.length === 0) {
    console.warn(
      `HEAD has no version tag - the post-commit hook did not run. Push it after "npm run version:file".`,
    )
  }

  console.log(`Pushing ${branch} to ${remote}.`)
  push(`HEAD:refs/heads/${branch}`)

  const known = remoteTags()
  const merged = new Set(mergedTags(branch))
  const missing = localTags().filter((tag) => !known.has(tag) && merged.has(tag))
  const skipped = localTags().filter((tag) => !known.has(tag) && !merged.has(tag))

  for (const tag of missing) {
    console.log(`Pushing ${tag}.`)
    push(`refs/tags/${tag}`)
  }

  for (const tag of skipped) {
    console.log(`Skipping ${tag}: its commit is not in ${branch}.`)
  }

  if (missing.length === 0) {
    console.log('No missing tag: the remote has every version of this branch.')
  }

  console.log(
    'Every pushed tag starts its own check run; the publish run follows when it is green.',
  )
}

main()
