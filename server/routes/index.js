const express = require('express');
const Crawler = require('../models/Crawler');
const CSVParser = require('../models/CSVParser');
const UserBasedCF = require('../algo/UserBasedCF');
const CoordinateManager = require('../models/CoordinateManager');
const queryString = require('querystring');
const Sector = require('../models/Sector');
const router = express.Router();
const Dbi = require('../db/Dbi');

router.get('/', (req, res) => res.send('Awais Qureshi and Pierre Seguin COMP 4601 Project'))

router.get('/update', (req, res) => {    
  let parser = new CSVParser(`${__dirname}/../../data/Parking_Tags_data_2015_1.csv`);

  parser.parse(async addr => {
    for (let address of Object.keys(addr)) {
      let totalPrice = 0;
      let avgPrice = 0;

      for (let keys of Object.keys(addr[address])) {
        let fullAddress = `${keys} ${address}`;

        let prices = addr[address][keys];
        for (let price of prices) {
          totalPrice += parseInt(price);
        }
        
        avgPrice = totalPrice / prices.length;

        try {
          let result = await Dbi.saveLocation(fullAddress, avgPrice, prices.length);
        } catch (err) { console.log(err); }
      }
    }
  });
});

router.get('/best/*/*', async (req, res) => {

    let numberOfQuadrants = 10;
    try{
      let testCoords = await Dbi.getCoordinates();
      let coordMan = new CoordinateManager();
      let userLat = parseFloat(req.params[0]);
      let userLong = parseFloat(req.params[1]);
      
      //get the best sectors based on dataset
      let s = new Sector(coordMan);
      let matrices = await s.getBestMatrix(userLat,userLong,numberOfQuadrants);

      //determine which quadrant lat and long
      let userLatIndex = coordMan.getLatIndex(req.params[0]);
      let userLongIndex = coordMan.getLongIndex(req.params[1]);
      if (userLatIndex === -1 || userLongIndex === -1){
        return res.json({success:false, message:'coordinate was out of range'});
      }

      //find predictions around the users sector
      let priceCF = new UserBasedCF(matrices.priceMatrix); 
      let ticketCF = new UserBasedCF(matrices.ticketMatrix); 

      // //determines area around the user's Sector
      let regions = [{x:-1,y:-1}, {x:0,y:0}, {x:1,y:1}];
      let topRegions = [];

      //finds the average cost of each quadrant
      let total = 0;
      let middle = Math.round(coordMan.lats.length/2)
      for(let i = middle - 1, a = 0; i < middle + 1, a < 3; i++, a++){
        for(let j = middle - 1, b = 0; j < middle + 1, b < 3; j++, b++){
          let best = await Dbi.getBestAddressInQuadrant(
            coordMan.lats[i],
            coordMan.lats[i+1],
            coordMan.longs[j],
            coordMan.longs[j+1]);
          if(best != null)
            topRegions[total] = best;
          else
            topRegions[total] = {
                Lat:      coordMan.lats[i] - (coordMan.lats[i+1] - coordMan.lats[i])/2, 
                Long:     coordMan.longs[j] - (coordMan.longs[j+1] - coordMan.longs[j])/2, 
                Price:    priceCF._computeUserBasedPrediction(userLatIndex + regions[a].x,userLongIndex + regions[a].y),
                Tickets:  ticketCF._computeUserBasedPrediction(userLatIndex + regions[b].x,userLongIndex + regions[b].y),
                Address: ''
            };
            total ++;
          }
      }
      return res.json({success:true, value:topRegions});
      
    } catch(err){
      console.log(err);
      return res.json({success:false});
    }

  });

  router.get('/locations', async (req, res) => {
    
    const {lat,long} = req.query;
    const area = 0.01;
    const latVal = parseFloat(lat);
    const longVal = parseFloat(long);
    try {
      
      let locations = await Dbi.getLimitedAddressesInQuadrant(latVal - area, latVal + area, longVal - area, longVal + area, 100);
      return res.json({success:true, value:locations});
    } catch(err) {
      return res.json({success:false});
    }
  });

module.exports = router;