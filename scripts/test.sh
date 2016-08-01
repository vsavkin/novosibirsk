#! /usr/local/bin/fish

rm -rf dist/spec/fixtures
cp -r spec/fixtures dist/spec/fixtures
./node_modules/jasmine/bin/jasmine.js