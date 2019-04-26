module.exports = {
    port: 7545,
    compileCommand: "cp ../truffle-coverage.js ./truffle.js && truffle compile",
    testCommand: "cp ../truffle-coverage.js ./truffle.js && truffle test ./test/quantstamp_audit_expired.js",
    copyPackages: ['openzeppelin-solidity'],
    skipFiles: ['test/QuantstampToken.sol', 'LinkedListLib.sol']
};
