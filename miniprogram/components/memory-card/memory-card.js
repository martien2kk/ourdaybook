Component({properties:{memory:Object},methods:{open(){this.triggerEvent('open',{date:this.data.memory.dateKey})}}})
