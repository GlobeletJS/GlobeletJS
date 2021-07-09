# Contributing to this repository

We encourage you to try modifying GlobeletJS code. Feel free to fork and
play with it as you like!

If you would like your changes to be incorporated into the main codebase, we
recommend you [open an issue][issues] to discuss your proposed changes. If you
start the discussion *before* working on the code, your changes are more
likely to be accepted.

[issues]: https://github.com/GlobeletJS/GlobeletJS/issues

## Should you change GlobeletJS, or build on top of it?
GlobeletJS is intended to be small and lightweight. If you want to add 
complicated functionality, it may be better to write your own module that
uses GlobeletJS as a dependency.

If you are developing on Node.js, you can install the package from NPM into
your repository:
```bash
npm install --save globeletjs
```

## How to get started
GlobeletJS follows the "fork and pull" [development model][]. You can start
by "forking" the repo to your own account on GitHub. Make your changes in
a "feature branch" with a descriptive name (NOT on the main branch).
Then, when you are ready to submit your changes for review and discussion,
open a pull request from your feature branch to the GlobeletJS main branch.

For a step-by-step explanation of how to do the forking and branching,
see this [helpful article from Scott Lowe][scott].

[Scott]: https://blog.scottlowe.org/2015/01/27/using-fork-branch-git-workflow/

[development model]: https://docs.github.com/en/github/collaborating-with-pull-requests/getting-started/about-collaborative-development-models


## GlobeletJS code structure
GlobeletJS works by tying together several other more specialized modules.
1. We render vector map data to a rectangular texture using [tile-setter][]
2. Then we wrap the map around a globe using [satellite-view][]
3. To animate the camera position, we incorporate [spinning-ball][]

Also, to save on typing, we delegate the low-level WebGL calls to [yawgl][]

[tile-setter]: https://github.com/GlobeletJS/tile-setter
[satellite-view]: https://github.com/GlobeletJS/satellite-view
[spinning-ball]: https://github.com/GlobeletJS/spinning-ball
[yawgl]: https://github.com/GlobeletJS/yawgl

## Version numbers
GlobeletJS follows [semver][]. If your pull request is approved, and the
changes are significant, you may be asked to update the version number.

To update the package.json and package-lock.json files, use the `npm version`
command, and commit and push the changes to your feature branch. But make sure NOT 
to "tag" the version. An administrator will tag the commit AFTER it has been
merged into the main branch.

```bash
npm version --no-git-tag-version <newversion>
```

Make sure to get agreement on the version number in the discussion on your
pull request.

[semver]: https://semver.org/

## Publishing (for administrators only)
The "prepublishOnly" NPM script will automatically tag with the version number
from `package.json`. Before executing `npm publish`, make sure:
1. You are on the `main` branch, and up-to-date with the upstream repo
  (`git pull ...`) with no uncommitted changes
2. The version number in `package.json` has been updated according to
  [semver][]
3. Your GPG key is set up and ready for [signing the tag][signing]

[signing]: https://git-scm.com/book/en/v2/Git-Tools-Signing-Your-Work
