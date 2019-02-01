if (!process.env.CI) require('dotenv-safe').load()

const GitHub = require('github')
const github = new GitHub()
github.authenticate({ type: 'token', token: process.env.ELECTRON_GITHUB_TOKEN })

if (process.argv.length < 6) {
  console.log('Usage: upload-to-github filePath fileName releaseId')
  process.exit(1)
}
const filePath = process.argv[2]
const fileName = process.argv[3]
const releaseId = process.argv[4]
const releaseVersion = process.argv[5]

const targetRepo = releaseVersion.indexOf('nightly') > 0 ? 'nightlies' : 'electron'

let retry = 0

function uploadToGitHub () {
  const fakeFileNamePrefix = `fake-${fileName}-fake-`
  const fakeFileName = `${fakeFileNamePrefix}${Date.now()}`
  const githubOpts = {
    owner: 'electron',
    repo: targetRepo,
    id: releaseId,
    filePath: filePath,
    name: fakeFileName
  }

  github.repos.uploadAsset(githubOpts).then((uploadResponse) => {
    console.log(`Successfully uploaded ${fileName} to GitHub as ${fakeFileName}. Going for the rename now.`)
    return github.repos.editAsset({
      owner: 'electron',
      repo: 'electron',
      id: uploadResponse.data.id,
      name: fileName
    }).then(() => {
      console.log(`Successfully renamed ${fakeFileName} to ${fileName}. All done now.`)
      process.exit(0)
    })
  }).catch((err) => {
    if (retry < 4) {
      console.log(`Error uploading ${fileName} as ${fakeFileName} to GitHub, will retry.  Error was:`, err)
      retry++
      github.repos.getRelease(githubOpts).then(release => {
        console.log('Got list of assets for existing release:')
        console.log(JSON.stringify(release.data.assets, null, '  '))
        const existingAssets = release.data.assets.filter(asset => asset.name.startsWith(fakeFileNamePrefix) || asset.name === fileName)
        if (existingAssets.length > 0) {
          console.log(`${fileName} already exists; will delete before retrying upload.`)
          Promise.all(
            existingAssets.map(existingAsset => github.repos.deleteAsset({
              owner: 'electron',
              repo: targetRepo,
              id: existingAsset.id
            }))
          ).catch((deleteErr) => {
            console.log(`Failed to delete existing asset ${fileName}.  Error was:`, deleteErr)
          }).then(uploadToGitHub)
        } else {
          console.log(`Current asset ${fileName} not found in existing assets; retrying upload.`)
          uploadToGitHub()
        }
      }).catch((getReleaseErr) => {
        console.log(`Fatal: Unable to get current release assets via getRelease!  Error was:`, getReleaseErr)
      })
    } else {
      console.log(`Error retrying uploading ${fileName} to GitHub:`, err)
      process.exitCode = 1
    }
  })
}

uploadToGitHub()
