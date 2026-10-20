const TITLE='在同日簿，认真收藏每一个今天'
const PATH='/pages/onboarding/onboarding'
const IMAGE='/assets/images/our-daybook-avatar-144.png'

function appMessage(){return {title:TITLE,path:PATH,imageUrl:IMAGE}}
function timeline(){return {title:TITLE,query:'',imageUrl:IMAGE}}

module.exports={appMessage,timeline}
