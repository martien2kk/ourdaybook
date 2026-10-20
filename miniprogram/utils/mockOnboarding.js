const MOCK_B_ONBOARDING_SEEN='our_daybook_mock_b_onboarding_seen'

function consumeFirstBVisit(){
  try{
    if(wx.getStorageSync(MOCK_B_ONBOARDING_SEEN))return false
    wx.setStorageSync(MOCK_B_ONBOARDING_SEEN,true)
    return true
  }catch(error){return false}
}

module.exports={consumeFirstBVisit}
