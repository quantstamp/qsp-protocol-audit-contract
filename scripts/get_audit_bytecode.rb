#!/usr/bin/ruby
# write the bytecode at an address to a file
require 'http'
address = ARGV[0]

response = HTTP[:accept => "application/json"].post("http://localhost:7545", :json => {jsonrpc: "2.0",method:"eth_getCode",params:[address],id:0} )
puts response.parse['result']
File.open("bytecode.bin", "w") {|file| file.write(response.parse['result'])}
