docker-compose up -d --wait

cd jmeter
mkdir plugins
cd plugins
wget https://github.com/sfakrudeen78/JMeter-InfluxDB-Writer/releases/download/v-1.2.2/JMeter-InfluxDB-Writer-plugin-1.2.2.jar
cd ../..

docker run --rm --name jmeter --network host -v %cd%/jmeter:/jmeter -v %cd%/jmeter/plugins:/plugins -it justb4/jmeter -n -t /jmeter/test.jmx -j /jmeter/jmeter.log

grafana-report export http://localhost:3000/d/QMfGnEuSz/jmeter-load-test?orgId=1&from=now-15m&to=now