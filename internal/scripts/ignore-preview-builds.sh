#!/bin/bash

echo "VERCEL_GIT_COMMIT_REF: $VERCEL_GIT_COMMIT_REF"

if [[ "$VERCEL_GIT_COMMIT_REF" == "gh-pages" ]] ; then
    # Cancel the build. gh-pages branch contains docs.
    echo "🛑 - Build cancelled on gh-pages branch"
    exit 0;

else 
    # Get root directory of the repo as an absolute path
    GIT_ROOT_PATH=$(git rev-parse --show-toplevel)

    if [[ -d "$GIT_ROOT_PATH/apps/render" ]]; then
        echo "✅ - Running git diff in $GIT_ROOT_PATH/apps/render"
        git diff HEAD^ HEAD --quiet "$GIT_ROOT_PATH"/apps/render
    else
        echo "🛑 - Build cancelled, no dir found at $GIT_ROOT_PATH/apps/render."
        exit 0;
    fi
fi