// base libs
import PropTypes from 'prop-types'
import React, { PureComponent } from 'react'
import {
  Platform,
  Dimensions,
  LayoutAnimation
} from 'react-native'
// map-related libs
import MapView from 'react-native-maps'
import SuperCluster from 'supercluster'
import GeoViewport from '@mapbox/geo-viewport'
// components / views
import ClusterMarker from './ClusterMarker'
// libs / utils
import {
  regionToBoundingBox,
  itemToGeoJSONFeature,
  getCoordinatesFromItem,
} from './util'
export default class ClusteredMapView extends PureComponent {

  constructor(props) {
    super(props)
    this.state = {
      data: [], // helds renderable clusters and markers
      region: props.region || props.initialRegion, // helds current map region
    }

    this.isAndroid = Platform.OS === 'android'
    this.dimensions = [props.width, props.height]

    this.mapRef = this.mapRef.bind(this)
    this.onClusterPress = this.onClusterPress.bind(this)
    this.onRegionChangeComplete = this.onRegionChangeComplete.bind(this)
    this.clusterize=this.clusterize.bind(this);
  }

  componentDidMount() {
    this.clusterize(this.props.data)
  }

  UNSAFE_componentWillReceiveProps(nextProps) {
    if (this.props.data !== nextProps.data)
      this.clusterize(nextProps.data)
  }

  UNSAFE_componentWillUpdate(nextProps, nextState) {
    if (!this.isAndroid && this.props.animateClusters && this.clustersChanged(nextState))
      LayoutAnimation.configureNext(this.props.layoutAnimationConf)
  }

  mapRef(ref) {
    this.mapview = ref
  }

  getMapRef() {
    return this.mapview
  }

  getClusteringEngine() {
    return this.index
  }

  clusterize(dataset) {
    this.index = new SuperCluster({ // eslint-disable-line new-cap
      extent: this.props.extent,
      minZoom: this.props.minZoom,
      maxZoom: this.props.maxZoom,
      radius: this.props.radius || (this.dimensions[0] * .08), // 4.5% of screen width
      minPoints: 20
    })

    // get formatted GeoPoints for cluster
    const rawData = []
    for (let i=0;i<dataset.length;i++){
      rawData.push(itemToGeoJSONFeature(dataset[i], this.props.accessor))
    }
    // load geopoints into SuperCluster
    this.index.load(rawData)

    const data = this.getClusters(this.state.region)
    this.setState({ data })
  }

  clustersChanged(nextState) {
    return this.state.data.length !== nextState.data.length
  }

  onRegionChangeComplete(region) {
    const data = this.getClusters(region)
    this.setState({ region, data }, () => {
      this.props.onRegionChangeComplete && this.props.onRegionChangeComplete(region, data)
    })
  }

  getClusters(region) {
    const bbox = regionToBoundingBox(region),
        viewport = (region.longitudeDelta) >= 40 ? { zoom: this.props.minZoom } : GeoViewport.viewport(bbox, this.dimensions)

    return this.index.getClusters(bbox, viewport.zoom)
  }

  onClusterPress(cluster) {
    // cluster press behavior might be extremely custom.
    if (!this.props.preserveClusterPressBehavior) {
      this.props.onClusterPress && this.props.onClusterPress(cluster.properties.cluster_id)
      return
    }

    // //////////////////////////////////////////////////////////////////////////////////
    // NEW IMPLEMENTATION (with fitToCoordinates)
    // //////////////////////////////////////////////////////////////////////////////////
    // get cluster children
    const children = this.index.getLeaves(cluster.properties.cluster_id, this.props.clusterPressMaxChildren)
    const markers = [];
    for (let i=0;i<children.length;i++){
      markers.push(children[i].properties.item)
    }

    const coordinates = [];

    for (let i =0;i<markers.length;i++){
      coordinates.push(getCoordinatesFromItem(markers[i], this.props.accessor, false))
    }

    // fit right around them, considering edge padding
    this.mapview.fitToCoordinates(coordinates, { edgePadding: this.props.edgePadding })

    this.props.onClusterPress && this.props.onClusterPress(cluster.properties.cluster_id, markers)
  }

  render() {
    const { style, ...props } = this.props
    return (
        <MapView
            {...props}
            style={style}
            ref={this.mapRef}
            onRegionChangeComplete={this.onRegionChangeComplete}>
          {
            this.props.clusteringEnabled && this.state.data.map((d) => {
              if (d.properties.point_count === 0)
                return this.props.renderMarker(d.properties.item)

              return (
                  <ClusterMarker
                      {...d}
                      onPress={this.onClusterPress}
                      renderCluster={this.props.renderCluster}
                      key={`cluster-${d.properties.cluster_id}`} />
              )
            })
          }
          {
            !this.props.clusteringEnabled && this.props.data.map(d => this.props.renderMarker(d))
          }
          {
            this.props.data.length>0 && this.props.data.length<10 ? this.props.data.map(d => this.props.renderMarker(d)):null
          }
          {this.props.children}
        </MapView>
    )
  }
}

ClusteredMapView.defaultProps = {
  minZoom: 1,
  maxZoom: 16,
  extent: 1024,
  accessor: 'location',
  animateClusters: true,
  clusteringEnabled: true,
  clusterPressMaxChildren: 100,
  preserveClusterPressBehavior: true,
  width: Dimensions.get('window').width,
  height: Dimensions.get('window').height,
  layoutAnimationConf: LayoutAnimation.Presets.spring,
  edgePadding: { top: 10, left: 10, right: 10, bottom: 10 }
}

ClusteredMapView.propTypes = {
  ...MapView.propTypes,
  // number
  radius: PropTypes.number,
  width: PropTypes.number.isRequired,
  height: PropTypes.number.isRequired,
  extent: PropTypes.number.isRequired,
  minZoom: PropTypes.number.isRequired,
  maxZoom: PropTypes.number.isRequired,
  clusterPressMaxChildren: PropTypes.number.isRequired,
  // array
  data: PropTypes.array.isRequired,
  // func
  onExplode: PropTypes.func,
  onImplode: PropTypes.func,
  onClusterPress: PropTypes.func,
  renderMarker: PropTypes.func.isRequired,
  renderCluster: PropTypes.func.isRequired,
  // bool
  animateClusters: PropTypes.bool.isRequired,
  clusteringEnabled: PropTypes.bool.isRequired,
  preserveClusterPressBehavior: PropTypes.bool.isRequired,
  // object
  layoutAnimationConf: PropTypes.object,
  edgePadding: PropTypes.object.isRequired,
  // string
  // mutiple
  accessor: PropTypes.oneOfType([PropTypes.string, PropTypes.func])
}
