---
title: Sim Agent
permalink: /projects/simagent
defaults:
  - scope:
      path: ""
      type: projects
---
**_SimAgent_** directly interfaces the user's laptop with [NSG](https://www.nsgportal.org/index.html) resources to run [NEURON](https://www.neuron.yale.edu/neuron/)-based network simulations. SimAgent has two core functions, automated job submission and parameter sweep. The automated job submission feature is a point and click interface that accepts any neuron or python program directory, submits the program to run remotely and watches it until completion with live updates to the user. The parameter sweep feature allows the same functionality with the added ability to specify sections of code to automatically change with each run. Users can specify a range of values for a parameter to take on, run each simulation in a parallel configuration and determine the optimal output for their needs. It currently supports connections to the [NSG-R](https://www.nsgportal.org/guide.html) restful API and connections using SSH to servers running [Slurm](https://slurm.schedmd.com/).

The source and Windows executable is available for download [here](https://tylerbanks.net/SimAgentMPI).

Also hosted on [CyNeuro.org](http://cyneuro.org/system/analytics/training_content).
