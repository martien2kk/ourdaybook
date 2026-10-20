Component({properties:{show:Boolean,title:String,content:String},methods:{cancel(){this.triggerEvent('cancel')},confirm(){this.triggerEvent('confirm')}}})
