### CONFIGURATION STEPS

#### RUN START SCRIPT TO INSTALL NECESSARY DEPENDENCIES
'''
#! /bin/bash

apt-get update

apt-get install -y gcc g++ make python net-tools

npm install -g --unsafe-perm homebridge homebridge-config-ui-x
'''
