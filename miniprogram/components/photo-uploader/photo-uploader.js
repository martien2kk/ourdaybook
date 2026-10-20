Component({properties:{src:String,busy:Boolean},methods:{choose(){this.triggerEvent('choose')},remove(){this.triggerEvent('remove')}}})
