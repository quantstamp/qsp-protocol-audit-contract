docs:
	markdown-pp Contribute.mdTemplate -o ./Contribute.md
	mkdir -p .github
	curl https://raw.githubusercontent.com/quantstamp/opensource-doc-gen/master/github_template/bug-report.md > .github/bug-report.md
	curl https://raw.githubusercontent.com/quantstamp/opensource-doc-gen/master/github_template/pull_request_template.md > .github/pull_request_template.md
	curl https://raw.githubusercontent.com/quantstamp/opensource-doc-gen/master/CodeOfConduct.md > .github/CODE_OF_CONDUCT.md
