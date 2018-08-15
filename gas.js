const superagent = require("superagent");
const Web3 = require("web3");
const web3 = new Web3(new Web3.providers.HttpProvider("https://mainnet.infura.io"));

const GasLimitGetNextAuditOK = web3.utils.toBN(171081);
const GasLimitGetNextAuditFail = web3.utils.toBN(32762);
const GasLimitSubmitReport = web3.utils.toBN(158151);

// the number of decimals in an ERC20 token
const Decimals = 18;

async function fetchGasPriceInWei () {
  const gasPriceHex = (await superagent.get("https://api.etherscan.io/api?module=proxy&action=eth_gasPrice")).body;
  return web3.utils.toBN(gasPriceHex.result);
}

async function fetchQspPrice () {
  const qspInfo = (await superagent.get("https://api.coinmarketcap.com/v1/ticker/quantstamp/")).body[0];
  const qspPriceInBtc = qspInfo.price_btc;
  const ethPriceInBtc = (await superagent.get("https://api.coinmarketcap.com/v1/ticker/ethereum/")).body[0].price_btc;
  const qspPriceInEth = qspPriceInBtc / ethPriceInBtc;
  const qspPriceInEthString = qspPriceInEth.toString();
  const dotPos = qspPriceInEthString.indexOf('.');
  const trimmedQspPrice = (dotPos !== -1) ? qspPriceInEthString.substr(0, dotPos + Decimals + 1) : qspPriceInEthString;
  return { wei: web3.utils.toBN(web3.utils.toWei(trimmedQspPrice, "ether")), usd: qspInfo.price_usd };
}

async function calculate (nodes, gasPrice) {
  if (!gasPrice) {
    gasPrice = await fetchGasPriceInWei();
  } else {
    gasPrice = web3.utils.toBN(gasPrice);
  }
  const n = web3.utils.toBN(nodes - 1);
  const minPriceInWeiBN = gasPrice.mul(GasLimitGetNextAuditOK.add(GasLimitSubmitReport).add(GasLimitGetNextAuditFail.mul(n)));
  const qspPrice = await fetchQspPrice();
  const qspPriceInWeiBN = qspPrice.wei;
  const minPriceInQsp = minPriceInWeiBN.div(qspPriceInWeiBN).toNumber();
  const nSuccessfulAudits = web3.utils.toBN(web3.utils.toWei("1", "ether")).div(minPriceInWeiBN).toNumber();
  console.log("Gas price (from Etherscan):");
  console.log(`  ${gasPrice.toNumber()} Wei = ${web3.utils.fromWei(gasPrice, 'gwei')} GWei = ${web3.utils.fromWei(gasPrice, 'ether')} ETH`);
  console.log("Min suggested price per audit:");
  console.log(`  ${minPriceInWeiBN.toString()} Wei = ${web3.utils.fromWei(minPriceInWeiBN, 'ether')} ETH`);
  console.log(`  ${web3.utils.toWei(minPriceInQsp.toString(), "ether")} weiQSP = ${minPriceInQsp} QSP`);
  console.log(`  ${minPriceInQsp * qspPrice.usd} USD`);
  console.log("For 1 ETH, an operator may get:");
  console.log(`  ${nSuccessfulAudits} successful audits`);
  console.log(`  ${nSuccessfulAudits * (nodes - 1)} failed attempts`);
  return "";
}

module.exports = {
  suggest_min_price: function (input) {
    if (input !== undefined && input.nodes === undefined) {
      return "Please enter the number of nodes as --nodes=N";
    }
    if (input === undefined ) {
      return "Please enter the number of nodes as --nodes=N and gas price in Gwei as --gasPrice=X";
    }
    return calculate (input.nodes, input.gasPrice);
  }
};

require('make-runnable/custom')({
  printOutputFrame: false
});
