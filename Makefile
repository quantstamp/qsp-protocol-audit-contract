docs:
	markdown-pp ./.github/CONTRIBUTE.mdTemplate -o ./CONTRIBUTE.md
	mkdir -p .github/ISSUE_TEMPLATE
	markdown-pp ./.github/bug_report.mdTemplate -o ./.github/ISSUE_TEMPLATE/bug_report.md
	markdown-pp ./.github/pull_request_template.mdTemplate -o ./.github/pull_request_template.md
	curl https://raw.githubusercontent.com/quantstamp/opensource-doc-gen/master/CODE_OF_CONDUCT.md > .github/CODE_OF_CONDUCT.md
	curl https://raw.githubusercontent.com/quantstamp/opensource-doc-gen/master/github_template/feature_request.md > .github/ISSUE_TEMPLATE/feature_request.md
